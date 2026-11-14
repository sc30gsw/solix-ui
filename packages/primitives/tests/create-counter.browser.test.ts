import fc from "fast-check";
import { createSignal, type Setter } from "solid-js";
import { expect, test } from "vite-plus/test";
import { type CounterHandlers, createCounter } from "../src/index";
import { flush, mount, unmount, watch } from "./support/browser-harness";
import { command, flushCommand, type Tick } from "./support/model";

test("by default it starts at 0 and moves by 1 with no bounds", () => {
  const [count, { increment, decrement }] = mount(() => createCounter());

  expect(count()).toBe(0);
  increment();
  flush();
  expect(count()).toBe(1);
  decrement();
  decrement();
  flush();
  expect(count()).toBe(-1);
});

test("the initial value is clamped into the bounds", () => {
  const [count] = mount(() => createCounter(11, { max: 10 }));

  expect(count()).toBe(10);
});

test("a negative step still increments upward", () => {
  const [count, { increment }] = mount(() => createCounter(0, { step: -2 }));

  increment();
  flush();
  expect(count()).toBe(2);
});

test("each move clamps: with min -3, max 3 and step 5, 0 goes to 3, then -2, then -3", () => {
  const [count, { increment, decrement }] = mount(() =>
    createCounter(0, { min: -3, max: 3, step: 5 }),
  );
  const seen: number[] = [];

  increment();
  flush();
  seen.push(count());
  decrement();
  flush();
  seen.push(count());
  decrement();
  flush();
  seen.push(count());
  expect(seen).toEqual([3, -2, -3]);
});

test("set clamps, and reset returns to the clamped initial value", () => {
  const [count, { set, reset }] = mount(() => createCounter(15, { max: 10 }));

  set(20);
  flush();
  expect(count()).toBe(10);
  set(4);
  flush();
  reset();
  flush();
  expect(count()).toBe(10);
});

test("new bounds apply from the next handler, and a count out of them stays until then", () => {
  const [max, setMax] = createSignal(10);
  const [count, { set, increment }] = mount(() => createCounter(0, { max }));

  set(8);
  flush();
  setMax(5);
  flush();
  expect(count()).toBe(8);
  increment();
  flush();
  expect(count()).toBe(5);
});

test("each request decides on the value staged by the requests before it in the same tick, and one that changes nothing writes nothing", () => {
  const { handlers, seen } = mount(() => {
    const [count, handlers] = createCounter(0, { max: 2 });
    return { handlers, seen: watch(count) };
  });

  handlers.increment();
  handlers.increment();
  flush();
  handlers.increment();
  flush();
  expect(seen).toEqual([0, 2]);
});

test("the initial value is read once", () => {
  const [initial, setInitial] = createSignal(3);
  const [count, { set, reset }] = mount(() => createCounter(initial));

  setInitial(7);
  set(1);
  flush();
  reset();
  flush();
  expect(count()).toBe(3);
});

type Bounds = { min: number; max: number; step: number };
type Model = Tick<{ count: number; bounds: Bounds }> & { initial: number };
type Real = { count: () => number; handlers: CounterHandlers; setBounds: Setter<Bounds> };

function clamp(value: number, bounds: Bounds): number {
  return Math.min(Math.max(value, bounds.min), bounds.max);
}

function move(
  label: string,
  act: (handlers: CounterHandlers) => void,
  next: (model: Model) => number,
) {
  return command<Model, Real>(label, (model, real) => {
    act(real.handlers);
    model.staged = { ...model.staged, count: clamp(next(model), model.committed.bounds) };
  });
}

const small = fc.integer({ min: -6, max: 6 });
const bounds = fc.tuple(small, small, small).map(([low, high, step]): Bounds => ({
  min: Math.min(low, high),
  max: Math.max(low, high),
  step,
}));

const commands = [
  fc.constant(
    move(
      "increment()",
      (handlers) => handlers.increment(),
      (model) => model.staged.count + Math.abs(model.committed.bounds.step),
    ),
  ),
  fc.constant(
    move(
      "decrement()",
      (handlers) => handlers.decrement(),
      (model) => model.staged.count - Math.abs(model.committed.bounds.step),
    ),
  ),
  small.map((value) =>
    move(
      `set(${value})`,
      (handlers) => handlers.set(value),
      () => value,
    ),
  ),
  fc.constant(
    move(
      "reset()",
      (handlers) => handlers.reset(),
      (model) => model.initial,
    ),
  ),
  bounds.map((next) =>
    command<Model, Real>(
      `the consumer sets min ${next.min}, max ${next.max} and step ${next.step}`,
      (model, real) => {
        real.setBounds(next);
        model.staged = { ...model.staged, bounds: next };
      },
    ),
  ),
  fc.constant(
    flushCommand<Model, Real>((model, real) => {
      expect(real.count(), "the count after the flush").toBe(model.committed.count);
    }),
  ),
];

test("for every generated sequence of moves, bound changes and flushes, it agrees with a model of the count", () => {
  fc.assert(
    fc.property(
      small,
      bounds,
      fc.commands(commands, { maxCommands: 30, size: "medium" }),
      (initial, start, sequence) => {
        const [current, setBounds] = createSignal(start);
        const [count, handlers] = mount(() =>
          createCounter(initial, {
            min: () => current().min,
            max: () => current().max,
            step: () => current().step,
          }),
        );
        const first = { count: clamp(initial, start), bounds: start };
        const model: Model = { initial, staged: first, committed: first };
        expect(count(), "the first count").toBe(first.count);
        fc.modelRun(() => ({ model, real: { count, handlers, setBounds } }), sequence);
        unmount();
      },
    ),
  );
});
