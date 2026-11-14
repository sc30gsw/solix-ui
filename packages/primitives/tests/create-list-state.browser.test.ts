import { flush } from "solid-js";
import { expect, test } from "vite-plus/test";
import { createListState, type ListStateHandlers } from "../src/index";
import { mount, watch } from "./support/browser-harness";

type Item = { id: number; label: string };

function listOf<T>(initial: T[] | (() => T[])) {
  return mount(() => {
    const [list, handlers] = createListState<T>(initial);
    return { list, handlers, seen: watch(list) };
  });
}

function after<T>(
  list: () => T[],
  handlers: ListStateHandlers<T>,
  act: (handlers: ListStateHandlers<T>) => void,
): T[] {
  act(handlers);
  flush();
  return list();
}

test("it starts empty by default, and calls a function given as the initial value once", () => {
  const empty = listOf<number>([]);
  let calls = 0;
  const lazy = listOf(() => {
    calls += 1;
    return [1, 2];
  });

  expect(empty.list()).toEqual([]);
  expect(lazy.list()).toEqual([1, 2]);
  expect(calls).toBe(1);
});

test("append, prepend and insert keep the order of several items, and insert works at 0, the middle and the end", () => {
  const { list, handlers } = listOf([1, 2]);

  expect(after(list, handlers, (h) => h.append(3, 4))).toEqual([1, 2, 3, 4]);
  expect(after(list, handlers, (h) => h.prepend(-1, 0))).toEqual([-1, 0, 1, 2, 3, 4]);
  expect(after(list, handlers, (h) => h.insert(0, 9))).toEqual([9, -1, 0, 1, 2, 3, 4]);
  expect(after(list, handlers, (h) => h.insert(3, 7, 8))).toEqual([9, -1, 0, 7, 8, 1, 2, 3, 4]);
  expect(after(list, handlers, (h) => h.insert(9, 5))).toEqual([9, -1, 0, 7, 8, 1, 2, 3, 4, 5]);
});

test("pop and shift remove the last and the first item", () => {
  const { list, handlers } = listOf(["a", "b", "c"]);

  expect(after(list, handlers, (h) => h.pop())).toEqual(["a", "b"]);
  expect(after(list, handlers, (h) => h.shift())).toEqual(["b"]);
});

test("remove takes several indices, counted in the list before the removal", () => {
  const { list, handlers } = listOf(["a", "b", "c", "d", "e"]);

  expect(after(list, handlers, (h) => h.remove(0, 2, 4))).toEqual(["b", "d"]);
});

test("reorder moves one item, and swap exchanges two", () => {
  const { list, handlers } = listOf(["a", "b", "c", "d"]);

  expect(after(list, handlers, (h) => h.reorder({ from: 0, to: 2 }))).toEqual(["b", "c", "a", "d"]);
  expect(after(list, handlers, (h) => h.swap({ from: 0, to: 3 }))).toEqual(["d", "c", "a", "b"]);
});

test("apply, applyWhere and filter run on every item with its index", () => {
  const { list, handlers } = listOf([1, 2, 3, 4]);

  expect(after(list, handlers, (h) => h.apply((item, index) => item * 10 + index))).toEqual([
    10, 21, 32, 43,
  ]);
  expect(
    after(list, handlers, (h) =>
      h.applyWhere(
        (_item, index) => index % 2 === 0,
        (item) => -item,
      ),
    ),
  ).toEqual([-10, 21, -32, 43]);
  expect(after(list, handlers, (h) => h.filter((item) => item > 0))).toEqual([21, 43]);
});

test("setItem replaces an item, and setItemProp copies the object at an index with one key replaced", () => {
  const first: Item = { id: 1, label: "one" };
  const { list, handlers } = listOf<Item>([first, { id: 2, label: "two" }]);

  expect(after(list, handlers, (h) => h.setItem(1, { id: 3, label: "three" }))).toEqual([
    first,
    { id: 3, label: "three" },
  ]);
  expect(after(list, handlers, (h) => h.setItemProp(0, "label", "uno"))).toEqual([
    { id: 1, label: "uno" },
    { id: 3, label: "three" },
  ]);
  expect(first.label).toBe("one");
});

test("setState takes a list or an updater", () => {
  const { list, handlers } = listOf([1]);

  expect(after(list, handlers, (h) => h.setState([5, 6]))).toEqual([5, 6]);
  expect(after(list, handlers, (h) => h.setState((current) => [...current, 7]))).toEqual([5, 6, 7]);
});

test("every command makes a new array and leaves the old one as it was", () => {
  const { list, handlers } = listOf([3, 1, 2]);
  const before = list();

  handlers.append(4);
  handlers.swap({ from: 0, to: 1 });
  handlers.setItem(2, 9);
  flush();
  expect(before).toEqual([3, 1, 2]);
  expect(list()).toEqual([1, 3, 9, 4]);
  expect(list()).not.toBe(before);
});

test("commands before a flush build on each other, and one that leaves every item in place writes nothing", () => {
  const { handlers, seen } = listOf([1]);

  handlers.append(2);
  handlers.append(3);
  flush();
  handlers.filter(() => true);
  handlers.apply((item) => item);
  handlers.setState((current) => [...current]);
  flush();
  expect(seen).toEqual([[1], [1, 2, 3]]);
});
