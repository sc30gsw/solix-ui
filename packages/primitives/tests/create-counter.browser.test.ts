import fc from "fast-check";
import { createSignal, flush, type Setter } from "solid-js";
import { expect, test } from "vite-plus/test";
import { type CounterHandlers, createCounter } from "../src/index";
import { mount, unmount, watch } from "./support/browser-harness";

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

test("requests before a flush build on each other, and one that changes nothing writes nothing", () => {
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
type Model = {
  initial: number;
  staged: number;
  committed: number;
  stagedBounds: Bounds;
  committedBounds: Bounds;
};
type Real = {
  count: () => number;
  handlers: CounterHandlers;
  setBounds: Setter<Bounds>;
};

function clamp(value: number, bounds: Bounds): number {
  return Math.min(Math.max(value, bounds.min), bounds.max);
}

class Increment implements fc.Command<Model, Real> {
  check = () => true;
  run(model: Model, real: Real) {
    real.handlers.increment();
    model.staged = clamp(
      model.staged + Math.abs(model.committedBounds.step),
      model.committedBounds,
    );
  }
  toString = () => "increment()";
}

class Decrement implements fc.Command<Model, Real> {
  check = () => true;
  run(model: Model, real: Real) {
    real.handlers.decrement();
    model.staged = clamp(
      model.staged - Math.abs(model.committedBounds.step),
      model.committedBounds,
    );
  }
  toString = () => "decrement()";
}

class SetCount implements fc.Command<Model, Real> {
  constructor(readonly value: number) {}
  check = () => true;
  run(model: Model, real: Real) {
    real.handlers.set(this.value);
    model.staged = clamp(this.value, model.committedBounds);
  }
  toString = () => `set(${this.value})`;
}

class Reset implements fc.Command<Model, Real> {
  check = () => true;
  run(model: Model, real: Real) {
    real.handlers.reset();
    model.staged = clamp(model.initial, model.committedBounds);
  }
  toString = () => "reset()";
}

class SetBounds implements fc.Command<Model, Real> {
  constructor(readonly bounds: Bounds) {}
  check = () => true;
  run(model: Model, real: Real) {
    real.setBounds(this.bounds);
    model.stagedBounds = this.bounds;
  }
  toString = () =>
    `the consumer sets min ${this.bounds.min}, max ${this.bounds.max} and step ${this.bounds.step}`;
}

class Flush implements fc.Command<Model, Real> {
  check = () => true;
  run(model: Model, real: Real) {
    flush();
    model.committed = model.staged;
    model.committedBounds = model.stagedBounds;
    expect(real.count(), "the count after the flush").toBe(model.committed);
  }
  toString = () => "flush";
}

const small = fc.integer({ min: -6, max: 6 });
const bounds = fc.tuple(small, small, small).map(([low, high, step]): Bounds => ({
  min: Math.min(low, high),
  max: Math.max(low, high),
  step,
}));

const commands = [
  fc.constant(new Increment()),
  fc.constant(new Decrement()),
  small.map((value) => new SetCount(value)),
  fc.constant(new Reset()),
  bounds.map((next) => new SetBounds(next)),
  fc.constant(new Flush()),
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
        const model: Model = {
          initial,
          staged: clamp(initial, start),
          committed: clamp(initial, start),
          stagedBounds: start,
          committedBounds: start,
        };
        expect(count(), "the first count").toBe(model.committed);
        fc.modelRun(() => ({ model, real: { count, handlers, setBounds } }), sequence);
        unmount();
      },
    ),
  );
});
