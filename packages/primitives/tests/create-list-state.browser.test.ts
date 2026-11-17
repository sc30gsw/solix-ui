import fc from "fast-check";
import { expect, test } from "vite-plus/test";
import { createListState, type ListStateHandlers } from "#/src/index.ts";
import { flush, mount, unmount, watch } from "#/tests/support/browser-harness.ts";
import { command, flushCommand, type Tick } from "#/tests/support/model.ts";
import { assertProperty } from "../../../tests/support/properties.ts";

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

test("each request decides on the value staged by the requests before it in the same tick, and one that leaves every item in place writes nothing", () => {
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

type Model = Tick<number[]> & { shown: number[][] };
type Real = { list: () => number[]; handlers: ListStateHandlers<number>; seen: number[][] };

const item = fc.integer({ min: 0, max: 5 });
const position = fc.nat(6);

function edit(
  label: string,
  next: (staged: number[]) => number[],
  act: (handlers: ListStateHandlers<number>, staged: number[]) => void,
) {
  return command<Model, Real>(label, (model, real) => {
    act(real.handlers, model.staged);
    model.staged = next(model.staged);
  });
}

function wrapped(at: number, list: number[]): number {
  return list.length === 0 ? 0 : at % list.length;
}

function moved(list: number[], from: number, to: number): number[] {
  const copy = [...list];
  copy.splice(to, 0, ...copy.splice(from, 1));
  return copy;
}

function swapped(list: number[], from: number, to: number): number[] {
  const copy = [...list];
  copy[from] = list[to];
  copy[to] = list[from];
  return copy;
}

const commands = [
  item.map((value) =>
    edit(
      `append(${value})`,
      (staged) => [...staged, value],
      (handlers) => handlers.append(value),
    ),
  ),
  item.map((value) =>
    edit(
      `prepend(${value})`,
      (staged) => [value, ...staged],
      (handlers) => handlers.prepend(value),
    ),
  ),
  fc.tuple(position, item).map(([at, value]) =>
    edit(
      `insert(${at}, ${value}) at most at the end`,
      (staged) => {
        const index = Math.min(at, staged.length);
        return [...staged.slice(0, index), value, ...staged.slice(index)];
      },
      (handlers, staged) => handlers.insert(Math.min(at, staged.length), value),
    ),
  ),
  fc.constant(
    edit(
      "pop()",
      (staged) => staged.slice(0, -1),
      (handlers) => handlers.pop(),
    ),
  ),
  fc.constant(
    edit(
      "shift()",
      (staged) => staged.slice(1),
      (handlers) => handlers.shift(),
    ),
  ),
  fc.tuple(position, position).map(([first, second]) =>
    edit(
      `remove(${first}, ${second}) wrapped into the list`,
      (staged) => {
        const removed = [wrapped(first, staged), wrapped(second, staged)];
        return staged.filter((_item, index) => !removed.includes(index));
      },
      (handlers, staged) => handlers.remove(wrapped(first, staged), wrapped(second, staged)),
    ),
  ),
  fc.tuple(position, position).map(([from, to]) =>
    edit(
      `reorder({ from: ${from}, to: ${to} }) wrapped into the list`,
      (staged) =>
        staged.length === 0 ? staged : moved(staged, wrapped(from, staged), wrapped(to, staged)),
      (handlers, staged) => {
        if (staged.length > 0) {
          handlers.reorder({ from: wrapped(from, staged), to: wrapped(to, staged) });
        }
      },
    ),
  ),
  fc.tuple(position, position).map(([from, to]) =>
    edit(
      `swap({ from: ${from}, to: ${to} }) wrapped into the list`,
      (staged) =>
        staged.length === 0 ? staged : swapped(staged, wrapped(from, staged), wrapped(to, staged)),
      (handlers, staged) => {
        if (staged.length > 0) {
          handlers.swap({ from: wrapped(from, staged), to: wrapped(to, staged) });
        }
      },
    ),
  ),
  fc.tuple(position, item).map(([at, value]) =>
    edit(
      `setItem(${at}, ${value}) wrapped into the list`,
      (staged) => (staged.length === 0 ? staged : staged.with(wrapped(at, staged), value)),
      (handlers, staged) => {
        if (staged.length > 0) handlers.setItem(wrapped(at, staged), value);
      },
    ),
  ),
  item.map((value) =>
    edit(
      `filter(every item but ${value})`,
      (staged) => staged.filter((kept) => kept !== value),
      (handlers) => handlers.filter((kept) => kept !== value),
    ),
  ),
  fc.integer({ min: 0, max: 1 }).map((added) =>
    edit(
      `apply(item + ${added})`,
      (staged) => staged.map((kept) => kept + added),
      (handlers) => handlers.apply((kept) => kept + added),
    ),
  ),
  fc.array(item, { maxLength: 3 }).map((list) =>
    edit(
      `setState([${list.join(", ")}])`,
      () => list,
      (handlers) => handlers.setState([...list]),
    ),
  ),
  fc.constant(
    flushCommand<Model, Real>((model, real) => {
      const last = model.shown[model.shown.length - 1];
      if (JSON.stringify(last) !== JSON.stringify(model.committed)) {
        model.shown.push(model.committed);
      }
      expect(real.list(), "the list after the flush").toEqual(model.committed);
      expect(real.seen, "every list the accessor showed").toEqual(model.shown);
    }),
  ),
];

test("for every generated sequence of commands and flushes, it agrees with a model of the list and shows a list only when its items change", async (context) => {
  await assertProperty(
    context,
    fc.property(
      fc.array(item, { maxLength: 4 }),
      fc.commands(commands, { maxCommands: 30, size: "medium" }),
      (initial, sequence) => {
        const { list, handlers, seen } = listOf(initial);
        const model: Model = { staged: initial, committed: initial, shown: [initial] };
        fc.modelRun(() => ({ model, real: { list, handlers, seen } }), sequence);
        unmount();
      },
    ),
  );
});
