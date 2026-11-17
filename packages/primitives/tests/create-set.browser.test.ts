import fc from "fast-check";
import { createSignal } from "solid-js";
import { expect, test } from "vite-plus/test";
import { createSet } from "#/src/index.ts";
import { flush, mount, unmount, watch } from "#/tests/support/browser-harness.ts";
import { command, flushCommand, type Tick } from "#/tests/support/model.ts";

function setOf(values?: string[]) {
  return mount(() => {
    const set = createSet<string>(values);
    return { set, seen: watch(set) };
  });
}

function setLike(values: string[]) {
  return {
    size: values.length,
    has: (value: string) => values.includes(value),
    keys: () => values[Symbol.iterator](),
  };
}

test("it starts with the initial values, read once, or empty", () => {
  const [values, setValues] = createSignal(["a"]);
  const set = mount(() => createSet(values));
  const empty = mount(() => createSet<string>());

  setValues([]);
  flush();
  expect([...set()]).toEqual(["a"]);
  expect(empty().size).toBe(0);
});

test("add, delete and clear each make a new set, and reads are the platform's own", () => {
  const { set } = setOf(["a"]);
  const first = set();

  first.add("b");
  flush();
  const second = set();
  expect(second).not.toBe(first);
  expect([second.has("b"), second.size, [...second]]).toEqual([true, 2, ["a", "b"]]);
  expect(second.delete("a")).toBe(true);
  flush();
  set().clear();
  flush();
  expect(set().size).toBe(0);
  expect([...first]).toEqual(["a"]);
});

test("mutations before a flush all land, even through an older instance", () => {
  const { set } = setOf();
  const old = set();

  old.add("a");
  old.add("b");
  set().delete("a");
  flush();
  old.add("c");
  flush();
  expect([...set()]).toEqual(["b", "c"]);
});

test("add returns the set it was called on, and delete says whether the value was there", () => {
  const { set } = setOf(["a"]);
  const instance = set();

  expect(instance.add("b")).toBe(instance);
  expect(instance.delete("missing")).toBe(false);
  expect(instance.delete("b")).toBe(true);
});

test("adding a member it holds, and deleting or clearing nothing, change nothing", () => {
  const { set, seen } = setOf(["a"]);

  set().add("a");
  set().delete("missing");
  flush();
  set().delete("a");
  flush();
  set().clear();
  flush();
  expect(seen.length).toBe(2);
});

test("union, intersection, difference and symmetricDifference return a new plain set, take a set-like, and change nothing", () => {
  const { set, seen } = setOf(["a", "b", "c"]);
  const other = setLike(["b", "c", "d"]);
  const instance = set();

  const results = [
    instance.union(other),
    instance.intersection(other),
    instance.difference(other),
    instance.symmetricDifference(other),
  ];
  flush();
  expect(results.map((result) => [...result].sort())).toEqual([
    ["a", "b", "c", "d"],
    ["b", "c"],
    ["a"],
    ["a", "d"],
  ]);
  expect(
    results.every(
      (result) => result instanceof Set && result !== instance && !Object.hasOwn(result, "add"),
    ),
  ).toBe(true);
  expect([...set()]).toEqual(["a", "b", "c"]);
  expect(seen.length).toBe(1);
});

type Model = Tick<string[]> & { changedThisTick: boolean; shown: number };
type Real = { latest: () => Set<string>; seen: Set<string>[] };

const member = fc.constantFrom("a", "b", "c");
const instance = fc.nat(9);

function nthShown(real: Real, which: number): Set<string> {
  return real.seen[which % real.seen.length];
}

function change(model: Model, next: string[]): void {
  model.staged = next;
  model.changedThisTick = true;
}

const commands = [
  fc.tuple(member, instance).map(([value, which]) =>
    command<Model, Real>(`add(${value}) on shown instance ${which}`, (model, real) => {
      const target = nthShown(real, which);
      expect(target.add(value), "what add returned").toBe(target);
      if (!model.staged.includes(value)) change(model, [...model.staged, value]);
    }),
  ),
  fc.tuple(member, instance).map(([value, which]) =>
    command<Model, Real>(`delete(${value}) on shown instance ${which}`, (model, real) => {
      const held = model.staged.includes(value);
      expect(nthShown(real, which).delete(value), "what delete returned").toBe(held);
      if (held)
        change(
          model,
          model.staged.filter((kept) => kept !== value),
        );
    }),
  ),
  instance.map((which) =>
    command<Model, Real>(`clear() on shown instance ${which}`, (model, real) => {
      nthShown(real, which).clear();
      if (model.staged.length > 0) change(model, []);
    }),
  ),
  fc.constant(
    flushCommand<Model, Real>((model, real) => {
      if (model.changedThisTick) model.shown += 1;
      model.changedThisTick = false;
      expect([...real.latest()], "the members after the flush").toEqual(model.committed);
      expect(real.seen.length, "how many sets the accessor showed").toBe(model.shown);
    }),
  ),
];

test("for every generated sequence of mutations on any instance it showed, and flushes, it agrees with a model of the members and shows a new set once per tick that changed it", () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(member, { maxLength: 3 }),
      fc.commands(commands, { maxCommands: 30, size: "medium" }),
      (initial, sequence) => {
        const { set, seen } = setOf(initial);
        const model: Model = {
          staged: initial,
          committed: initial,
          changedThisTick: false,
          shown: 1,
        };
        fc.modelRun(() => ({ model, real: { latest: set, seen } }), sequence);
        unmount();
      },
    ),
  );
});
