import fc from "fast-check";
import { createSignal, flush } from "solid-js";
import { expect, test } from "vite-plus/test";
import { createStateHistory, type StateHistory, type StateHistoryHandlers } from "../src/index";
import { mount, unmount, watch } from "./support/browser-harness";
import { command, flushCommand, type Tick } from "./support/model";

function shown<T>(value: () => T, history: StateHistory<T>): [T, T[], number] {
  return [value(), history.history(), history.current()];
}

test("it starts with one entry, the initial value", () => {
  const [value, , history] = mount(() => createStateHistory("first"));

  expect(shown(value, history)).toEqual(["first", ["first"], 0]);
});

test("set drops the entries after the current one: back three times then set 5 on [1, 2, 3, 4] gives [1, 5]", () => {
  const [value, { set, back }, history] = mount(() => createStateHistory(1));

  set(2);
  set(3);
  set(4);
  flush();
  back();
  back();
  back();
  flush();
  set(5);
  flush();
  expect(shown(value, history)).toEqual([5, [1, 5], 1]);
});

test("back and forward take a number of steps and stop at either end", () => {
  const [value, { set, back, forward }, history] = mount(() => createStateHistory("a"));

  set("b");
  set("c");
  set("d");
  flush();
  back(2);
  flush();
  expect(shown(value, history)).toEqual(["b", ["a", "b", "c", "d"], 1]);
  back(5);
  flush();
  expect(history.current()).toBe(0);
  forward(10);
  flush();
  expect(shown(value, history)).toEqual(["d", ["a", "b", "c", "d"], 3]);
});

test("reset returns to one entry, the initial value read once", () => {
  const [initial, setInitial] = createSignal("first");
  const [value, { set, reset }, history] = mount(() => createStateHistory(initial));

  set("second");
  setInitial("changed");
  flush();
  reset();
  flush();
  expect(shown(value, history)).toEqual(["first", ["first"], 0]);
});

test("moves past either end, and a reset of a fresh history, write nothing", () => {
  const { handlers, seen } = mount(() => {
    const [value, handlers, history] = createStateHistory(0);
    return { handlers, seen: watch(() => [value(), history.history(), history.current()]) };
  });

  handlers.back();
  handlers.forward();
  handlers.reset();
  flush();
  expect(seen.length).toBe(1);
});

type Entries = { history: number[]; current: number };
type Model = Tick<Entries> & { initial: number };
type Real = {
  value: () => number;
  handlers: StateHistoryHandlers<number>;
  history: StateHistory<number>;
};

function moveBy(steps: number, staged: Entries): Entries {
  return {
    history: staged.history,
    current: Math.min(Math.max(staged.current + steps, 0), staged.history.length - 1),
  };
}

const steps = fc.integer({ min: 0, max: 4 });

const commands = [
  fc.integer({ min: 0, max: 9 }).map((value) =>
    command<Model, Real>(`set(${value})`, (model, real) => {
      real.handlers.set(value);
      model.staged = {
        history: [...model.staged.history.slice(0, model.staged.current + 1), value],
        current: model.staged.current + 1,
      };
    }),
  ),
  steps.map((count) =>
    command<Model, Real>(`back(${count})`, (model, real) => {
      real.handlers.back(count);
      model.staged = moveBy(-count, model.staged);
    }),
  ),
  steps.map((count) =>
    command<Model, Real>(`forward(${count})`, (model, real) => {
      real.handlers.forward(count);
      model.staged = moveBy(count, model.staged);
    }),
  ),
  fc.constant(
    command<Model, Real>("reset()", (model, real) => {
      real.handlers.reset();
      model.staged = { history: [model.initial], current: 0 };
    }),
  ),
  fc.constant(
    flushCommand<Model, Real>((model, real) => {
      expect(
        shown(real.value, real.history),
        "the value, the history and the index after the flush",
      ).toEqual([
        model.committed.history[model.committed.current],
        model.committed.history,
        model.committed.current,
      ]);
    }),
  ),
];

test("for every generated sequence of sets, moves, resets and flushes, it agrees with a model of the history", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 9 }),
      fc.commands(commands, { maxCommands: 30, size: "medium" }),
      (initial, sequence) => {
        const [value, handlers, history] = mount(() => createStateHistory(initial));
        const start = { history: [initial], current: 0 };
        const model: Model = { initial, staged: start, committed: start };
        fc.modelRun(() => ({ model, real: { value, handlers, history } }), sequence);
        unmount();
      },
    ),
  );
});
