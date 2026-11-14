import fc from "fast-check";
import { createSignal, flush } from "solid-js";
import { expect, test } from "vite-plus/test";
import { createMap } from "../src/index";
import { mount, unmount, watch } from "./support/browser-harness";
import { command, flushCommand, type Tick } from "./support/model";

function mapOf(entries?: [string, number][]) {
  return mount(() => {
    const map = createMap<string, number>(entries);
    return { map, seen: watch(map) };
  });
}

test("it starts with the initial entries, read once, or empty", () => {
  const [entries, setEntries] = createSignal<[string, number][]>([["a", 1]]);
  const map = mount(() => createMap(entries));
  const empty = mount(() => createMap<string, number>());

  setEntries([]);
  flush();
  expect([...map()]).toEqual([["a", 1]]);
  expect(empty().size).toBe(0);
});

test("set, delete and clear each make a new map, and reads are the platform's own", () => {
  const { map } = mapOf([["a", 1]]);
  const first = map();

  first.set("b", 2);
  flush();
  const second = map();
  expect(second).not.toBe(first);
  expect([second.get("b"), second.has("a"), second.size, [...second.keys()]]).toEqual([
    2,
    true,
    2,
    ["a", "b"],
  ]);
  expect(second.delete("a")).toBe(true);
  flush();
  const third = map();
  expect(third).not.toBe(second);
  third.clear();
  flush();
  expect(map().size).toBe(0);
  expect([...first]).toEqual([["a", 1]]);
});

test("mutations before a flush all land, even through an older instance", () => {
  const { map } = mapOf();
  const old = map();

  old.set("a", 1);
  old.set("b", 2);
  map().delete("a");
  flush();
  old.set("c", 3);
  flush();
  expect([...map()]).toEqual([
    ["b", 2],
    ["c", 3],
  ]);
});

test("set returns the map it was called on, and delete says whether the key was there", () => {
  const { map } = mapOf([["a", 1]]);
  const instance = map();

  expect(instance.set("b", 2)).toBe(instance);
  expect(instance.delete("missing")).toBe(false);
  expect(instance.delete("b")).toBe(true);
  expect(instance.delete("b")).toBe(false);
});

test("set with the value a key holds, and delete or clear of nothing, change nothing", () => {
  const { map, seen } = mapOf([["a", 1]]);

  map().set("a", 1);
  map().delete("missing");
  flush();
  map().delete("a");
  flush();
  map().clear();
  flush();
  expect(seen.length).toBe(2);
});

type Entries = [string, number][];
type Model = Tick<Entries> & { changedThisTick: boolean; shown: number };
type Real = { latest: () => Map<string, number>; seen: Map<string, number>[] };

const key = fc.constantFrom("a", "b", "c");
const value = fc.integer({ min: 0, max: 2 });
const instance = fc.nat(9);

function nthShown(real: Real, which: number): Map<string, number> {
  return real.seen[which % real.seen.length];
}

function change(model: Model, next: Entries): void {
  model.staged = next;
  model.changedThisTick = true;
}

const commands = [
  fc.tuple(key, value, instance).map(([name, next, which]) =>
    command<Model, Real>(`set(${name}, ${next}) on shown instance ${which}`, (model, real) => {
      const target = nthShown(real, which);
      expect(target.set(name, next), "what set returned").toBe(target);
      const held = model.staged.find(([held]) => held === name);
      if (held === undefined) change(model, [...model.staged, [name, next]]);
      else if (held[1] !== next) {
        change(
          model,
          model.staged.map(([existing, stored]) => [existing, existing === name ? next : stored]),
        );
      }
    }),
  ),
  fc.tuple(key, instance).map(([name, which]) =>
    command<Model, Real>(`delete(${name}) on shown instance ${which}`, (model, real) => {
      const held = model.staged.some(([existing]) => existing === name);
      expect(nthShown(real, which).delete(name), "what delete returned").toBe(held);
      if (held)
        change(
          model,
          model.staged.filter(([existing]) => existing !== name),
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
      expect([...real.latest()], "the entries after the flush").toEqual(model.committed);
      expect(real.seen.length, "how many maps the accessor showed").toBe(model.shown);
    }),
  ),
];

test("for every generated sequence of mutations on any instance it showed, and flushes, it agrees with a model of the entries and shows a new map once per tick that changed it", () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.tuple(key, value), { maxLength: 3, selector: ([name]) => name }),
      fc.commands(commands, { maxCommands: 30, size: "medium" }),
      (initial, sequence) => {
        const { map, seen } = mapOf(initial);
        const model: Model = {
          staged: initial,
          committed: initial,
          changedThisTick: false,
          shown: 1,
        };
        fc.modelRun(() => ({ model, real: { latest: map, seen } }), sequence);
        unmount();
      },
    ),
  );
});
