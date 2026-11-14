import { createSignal, flush } from "solid-js";
import { expect, test } from "vite-plus/test";
import { createSet } from "../src/index";
import { mount, watch } from "./support/browser-harness";

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
