import { createSignal, flush } from "solid-js";
import { expect, test } from "vite-plus/test";
import { createMap } from "../src/index";
import { mount, watch } from "./support/browser-harness";

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
