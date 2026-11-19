import fc from "fast-check";
import { expect, test } from "vite-plus/test";
import {
  changeListAt,
  clearListKeys,
  type ListOperation,
  moveListKeys,
} from "#/src/internal-lists.ts";
import { getPath } from "#/src/internal-paths.ts";
import { assertProperty } from "../../../tests/support/properties.ts";

const errors = {
  name: "name-error",
  "fruits.0.name": "fruit-error-1",
  "fruits.0.available": "fruit-error-2",
  "fruits.4.available": "fruit-error-3",
  "fruits.15.inner.name": "fruit-error-4",
  "fruits.15.inner.0.name": "fruit-error-5",
  "nested.0.inner.1.name": "nested-error-1",
  "nested.0.inner.2.name": "nested-error-2",
  "nested.2.inner.2.name": "keep-nested-error-1",
  "nested.3.inner.0.name": "keep-nested-error-2",
  "nested.5.inner.1.check": "keep-nested-error-3",
  "nested.0.inner.2.check": "nested-error-3",
  "nested.0.inner.5.check": "nested-error-4",
};

const insertAt = (index?: number): ListOperation => ({ kind: "insert", item: null, index });
const removeAt = (index: number): ListOperation => ({ kind: "remove", index });
const reorder = (from: number, to: number): ListOperation => ({ kind: "reorder", from, to });
const replaceAt = (index: number, item: unknown): ListOperation => ({
  kind: "replace",
  index,
  item,
});

test("an insert puts the item at its index, or at the end without one, in a nested list too", () => {
  expect(changeListAt("a", { kind: "insert", item: 4, index: 1 }, { a: [1, 2, 3] })).toStrictEqual({
    a: [1, 4, 2, 3],
  });
  expect(changeListAt("a", { kind: "insert", item: 4 }, { a: [1, 2, 3] })).toStrictEqual({
    a: [1, 2, 3, 4],
  });
  expect(
    changeListAt("a.1.b", { kind: "insert", item: 4 }, { a: [{ b: [1, 2, 3] }, { b: [1, 2, 3] }] }),
  ).toStrictEqual({ a: [{ b: [1, 2, 3] }, { b: [1, 2, 3, 4] }] });
});

test("a remove takes the item at its index out of a list at the root or nested, and changes nothing where the path holds no list", () => {
  expect(changeListAt("a", removeAt(1), { a: [1, 2, 3] })).toStrictEqual({ a: [1, 3] });
  expect(changeListAt("a.d.a", removeAt(1), { a: [1, 2, 3] })).toStrictEqual({ a: [1, 2, 3] });
  expect(changeListAt("b.c.d.0", removeAt(1), { a: [1, 2, 3] })).toStrictEqual({ a: [1, 2, 3] });
  expect(
    changeListAt("a.0.b", removeAt(1), { a: [{ b: [1, 2, 3] }, { b: [1, 2, 3] }] }),
  ).toStrictEqual({ a: [{ b: [1, 3] }, { b: [1, 2, 3] }] });
});

test("a remove and a reorder keep each hole of a list a hole, so each moved key still names its item", () => {
  const jobs: unknown[] = [{ title: "a" }, { title: "b" }, { title: "c" }];
  Reflect.deleteProperty(jobs, 1);
  const keys = { "jobs.0.title": "a", "jobs.2.title": "c" };
  const removed = getPath("jobs", changeListAt("jobs", removeAt(0), { jobs }));
  const reordered = getPath("jobs", changeListAt("jobs", reorder(1, 0), { jobs }));

  expect(Array.isArray(removed) && Object.keys(removed)).toStrictEqual(["1"]);
  expect(moveListKeys("jobs", removeAt(0), keys, 3)).toStrictEqual({ "jobs.1.title": "c" });
  expect(getPath("1.title", removed)).toBe("c");
  expect(Array.isArray(reordered) && Object.keys(reordered)).toStrictEqual(["1", "2"]);
  expect(moveListKeys("jobs", reorder(1, 0), keys, 3)).toStrictEqual({
    "jobs.1.title": "a",
    "jobs.2.title": "c",
  });
});

test("keys of a list at the field named by the empty string move under that field, and a root field named 0 stays", () => {
  expect(moveListKeys("", removeAt(0), { ".1.x": "moved", "0.x": "other" }, 2)).toStrictEqual({
    ".0.x": "moved",
    "0.x": "other",
  });
});

test("a reorder moves the item from one index to another, at the root or nested, and changes nothing where the path holds no list", () => {
  expect(changeListAt("a", reorder(2, 0), { a: [1, 2, 3] })).toStrictEqual({ a: [3, 1, 2] });
  expect(changeListAt("a", reorder(1, 2), { a: [1, 2, 3] })).toStrictEqual({ a: [1, 3, 2] });
  expect(
    changeListAt("a.0.b", reorder(2, 0), { a: [{ b: [1, 2, 3] }, { b: [1, 2, 3] }] }),
  ).toStrictEqual({ a: [{ b: [3, 1, 2] }, { b: [1, 2, 3] }] });
  expect(
    changeListAt("a.1.b", reorder(1, 2), { a: [{ b: [1, 2, 3] }, { b: [1, 2, 3] }] }),
  ).toStrictEqual({ a: [{ b: [1, 2, 3] }, { b: [1, 3, 2] }] });
  expect(changeListAt("c", reorder(1, 2), { a: 1, b: 2 })).toStrictEqual({ a: 1, b: 2 });
  expect(changeListAt("a.c", reorder(1, 2), { a: 1, b: 2 })).toStrictEqual({ a: 1, b: 2 });
  expect(changeListAt("a.c", reorder(1, 2), { a: { c: 1 }, b: 2 })).toStrictEqual({
    a: { c: 1 },
    b: 2,
  });
});

test("a replace puts the item at its index, and changes nothing where the path holds no list or the index is past its end", () => {
  expect(changeListAt("field", replaceAt(1, "new"), { field: ["old", "old"] })).toEqual({
    field: ["old", "new"],
  });
  expect(changeListAt("field", replaceAt(1, "new"), { field: "old" })).toEqual({ field: "old" });
  expect(changeListAt("field", replaceAt(2, "new"), { field: ["old"] })).toEqual({
    field: ["old"],
  });
});

test("an operation with an index that is not a whole number from 0 changes neither the list nor its keys", () => {
  const values = { list: [1, 2, 3] };
  const keyed = { "list.0": "a", "list.1.name": "b", "list.2": "c" };

  for (const operation of [removeAt(-1), replaceAt(-1, 9), reorder(0, -1), insertAt(1.5)]) {
    expect(changeListAt("list", operation, values)).toBe(values);
    expect(moveListKeys("list", operation, keyed, 50)).toStrictEqual(keyed);
  }
});

test("an insert moves every key of an item at or after its index one index up", () => {
  const {
    "fruits.4.available": available,
    "fruits.15.inner.name": name,
    "fruits.15.inner.0.name": nestedName,
    ...kept
  } = errors;

  expect(moveListKeys("fruits", insertAt(4), errors, 50)).toStrictEqual({
    ...kept,
    "fruits.5.available": available,
    "fruits.16.inner.name": name,
    "fruits.16.inner.0.name": nestedName,
  });
});

test("a remove drops every key of the removed item and moves every later one an index down", () => {
  const {
    "fruits.4.available": _removed,
    "fruits.15.inner.name": name,
    "fruits.15.inner.0.name": nestedName,
    ...kept
  } = errors;

  expect(moveListKeys("fruits", removeAt(4), errors, 50)).toStrictEqual({
    ...kept,
    "fruits.14.inner.name": name,
    "fruits.14.inner.0.name": nestedName,
  });
});

test("keys of a list nested in a list item move with an insert and a remove at that list", () => {
  const {
    "nested.0.inner.2.name": name,
    "nested.0.inner.2.check": check,
    "nested.0.inner.5.check": later,
    ...kept
  } = errors;

  expect(moveListKeys("nested.0.inner", insertAt(2), errors, 50)).toStrictEqual({
    ...kept,
    "nested.0.inner.3.name": name,
    "nested.0.inner.3.check": check,
    "nested.0.inner.6.check": later,
  });
  expect(moveListKeys("nested.0.inner", removeAt(2), errors, 50)).toStrictEqual({
    ...kept,
    "nested.0.inner.4.check": later,
  });
});

test("a remove from a list of plain values drops the removed item's key and moves the later ones down", () => {
  const listErrors = {
    name: "name-error",
    "fruits.0": "fruit-error-1",
    "fruits.1": "fruit-error-2",
    "fruits.2": "fruit-error-3",
  };

  expect(moveListKeys("fruits", removeAt(0), listErrors, 50)).toStrictEqual({
    name: "name-error",
    "fruits.0": "fruit-error-2",
    "fruits.1": "fruit-error-3",
  });
  expect(moveListKeys("fruits", removeAt(1), listErrors, 50)).toStrictEqual({
    name: "name-error",
    "fruits.0": "fruit-error-1",
    "fruits.1": "fruit-error-3",
  });
});

test("moving keys changes nothing for an insert with no index, a path no key names, or an index past every key", () => {
  expect(moveListKeys("fruits", insertAt(), errors, 50)).toStrictEqual(errors);
  expect(moveListKeys("does-not-exist", insertAt(1), errors, 50)).toStrictEqual(errors);
  expect(moveListKeys("fruits", insertAt(100), errors, 50)).toStrictEqual(errors);
});

test("a reorder moves the keys of the moved item to its new index and shifts the items between", () => {
  expect(moveListKeys("a", reorder(2, 0), { "a.0": true }, 50)).toStrictEqual({ "a.1": true });
  expect(moveListKeys("a", reorder(2, 0), { "a.0": true, "a.2": "Error" }, 50)).toStrictEqual({
    "a.0": "Error",
    "a.1": true,
  });
  expect(
    moveListKeys(
      "sortable",
      reorder(0, 1),
      {
        "sortable.0.value1": "Error 1",
        "sortable.0.value2": "Error 2",
        "sortable.1.value1": "Error 3",
        "sortable.1.value2": "Error 4",
      },
      50,
    ),
  ).toStrictEqual({
    "sortable.0.value1": "Error 3",
    "sortable.0.value2": "Error 4",
    "sortable.1.value1": "Error 1",
    "sortable.1.value2": "Error 2",
  });
  expect(
    moveListKeys(
      "items",
      reorder(0, 2),
      {
        "items.0.name": "Name error",
        "items.0.nested.field": "Nested error",
        "items.2.name": "Name error 2",
      },
      50,
    ),
  ).toStrictEqual({
    "items.1.name": "Name error 2",
    "items.2.name": "Name error",
    "items.2.nested.field": "Nested error",
  });
});

test("a reorder leaves an item whose index starts with the same digits, and leaves its input as it was", () => {
  expect(
    moveListKeys(
      "items",
      reorder(1, 0),
      {
        "items.0.name": "Error 0",
        "items.1.name": "Error 1",
        "items.10.name": "Error 10",
        "items.12": "Error 12",
      },
      50,
    ),
  ).toStrictEqual({
    "items.0.name": "Error 1",
    "items.1.name": "Error 0",
    "items.10.name": "Error 10",
    "items.12": "Error 12",
  });
  for (const [from, to, moved] of [
    [0, 2, { "items.0": "B", "items.1": "C", "items.2": "A" }],
    [2, 0, { "items.0": "C", "items.1": "A", "items.2": "B" }],
  ] as const) {
    const keyed = { "items.0": "A", "items.1": "B", "items.2": "C", "items.3": "D" };

    expect(moveListKeys("items", reorder(from, to), keyed, 50)).toStrictEqual({
      ...moved,
      "items.3": "D",
    });
    expect(keyed).toStrictEqual({ "items.0": "A", "items.1": "B", "items.2": "C", "items.3": "D" });
  }
});

test("a reorder keeps path boundaries and keys whose segment after the list is not an index", () => {
  expect(
    moveListKeys(
      "group.items",
      reorder(0, 2),
      {
        "group.items.1.nested.0.name": "B",
        "group.items.10.name": "Outside interval",
        "group.items.01.name": "Non-index property",
        "group.items.1a.name": "Non-index property",
        "group.items.name": "List property",
        "group.items": "List error",
        "group.itemsExtra.1.name": "Sibling list",
        "other.group.items.1.name": "Unrelated path",
      },
      50,
    ),
  ).toStrictEqual({
    "group.items.0.nested.0.name": "B",
    "group.items.10.name": "Outside interval",
    "group.items.01.name": "Non-index property",
    "group.items.1a.name": "Non-index property",
    "group.items.name": "List property",
    "group.items": "List error",
    "group.itemsExtra.1.name": "Sibling list",
    "other.group.items.1.name": "Unrelated path",
  });
});

test("a reorder to the same index, or at a path no key names, changes no key", () => {
  const keyed = { "items.0": "A", "items.1.name": "B", "items.2": "C" };

  expect(moveListKeys("items", reorder(1, 1), keyed, 50)).toStrictEqual(keyed);
  expect(moveListKeys("c", reorder(1, 2), { "a.0": true }, 50)).toStrictEqual({ "a.0": true });
});

test("a replace changes no key", () => {
  expect(moveListKeys("fruits", replaceAt(4, null), errors, 50)).toStrictEqual(errors);
});

test("clearing a list's keys drops every key under it and keeps the list's own key and those of lists with a longer name", () => {
  expect(
    clearListKeys("items", {
      items: true,
      "items.0.name": true,
      "lineitems.0.name": true,
      "billing.items.0.name": true,
      "itemsExtra.0.name": true,
    }),
  ).toStrictEqual({
    items: true,
    "lineitems.0.name": true,
    "billing.items.0.name": true,
    "itemsExtra.0.name": true,
  });
  expect(
    Object.keys(clearListKeys("fruits", errors)).filter((key) => key.startsWith("fruits")),
  ).toEqual([]);
  expect(clearListKeys("nested.0.inner", errors)).toStrictEqual({
    name: "name-error",
    "fruits.0.name": "fruit-error-1",
    "fruits.0.available": "fruit-error-2",
    "fruits.4.available": "fruit-error-3",
    "fruits.15.inner.name": "fruit-error-4",
    "fruits.15.inner.0.name": "fruit-error-5",
    "nested.2.inner.2.name": "keep-nested-error-1",
    "nested.3.inner.0.name": "keep-nested-error-2",
    "nested.5.inner.1.check": "keep-nested-error-3",
  });
});

const suffixes = ["", "name", "inner.0.name", "1"];

const keysBesideTheList = (path: string) => [
  path,
  `${path}.name`,
  `${path}.01`,
  `${path}x.0`,
  `other.${path}.0`,
];

type Bag = string[];

function keyedBy(path: string, bags: readonly Bag[]): Record<string, string> {
  return Object.fromEntries([
    ...keysBesideTheList(path).map((key) => [key, `beside:${key}`]),
    ...bags.flatMap((bag, index) =>
      bag.map((suffix) => [
        suffix === "" ? `${path}.${index}` : `${path}.${index}.${suffix}`,
        `${bag.join("|")}:${suffix}`,
      ]),
    ),
  ]);
}

function modelled<Item>(items: readonly Item[], operation: ListOperation, inserted: Item): Item[] {
  switch (operation.kind) {
    case "insert": {
      const at = operation.index ?? items.length;
      return [...items.slice(0, at), inserted, ...items.slice(at)];
    }
    case "remove":
      return items.filter((_item, index) => index !== operation.index);
    case "reorder": {
      const without = items.filter((_item, index) => index !== operation.from);
      return [
        ...without.slice(0, operation.to),
        ...items.slice(operation.from, operation.from + 1),
        ...without.slice(operation.to),
      ];
    }
    case "replace":
      return items.map((item, index) => (index === operation.index ? inserted : item));
  }
}

function operationFor(length: number): fc.Arbitrary<ListOperation> {
  const inList = fc.nat(Math.max(length - 1, 0));
  const insert = fc.record({
    kind: fc.constant("insert" as const),
    item: fc.constant("inserted"),
    index: fc.option(fc.nat(length), { nil: undefined }),
  });
  if (length === 0) return insert;
  return fc.oneof(
    insert,
    fc.record({ kind: fc.constant("remove" as const), index: inList }),
    fc.record({ kind: fc.constant("reorder" as const), from: inList, to: inList }),
    fc.record({
      kind: fc.constant("replace" as const),
      index: inList,
      item: fc.constant("replaced"),
    }),
  );
}

const listCase = fc
  .record({
    path: fc.constantFrom("list", "group.0.list", "a.b", ""),
    bags: fc.array(fc.uniqueArray(fc.constantFrom(...suffixes)), { maxLength: 6 }),
  })
  .chain((generated) =>
    fc.record({
      path: fc.constant(generated.path),
      bags: fc.constant(generated.bags.map((bag, index) => [`item${index}`, ...bag])),
      operation: operationFor(generated.bags.length),
    }),
  );

function valuesWith(path: string, items: readonly unknown[]): Record<string, unknown> {
  const sibling = { untouched: true };
  if (path === "list") return { list: items, sibling };
  if (path === "") return { "": items, sibling };
  if (path === "a.b") return { a: { b: items, c: sibling }, sibling };
  return { group: [{ list: items, sibling }, sibling], sibling };
}

test("each list operation in range changes the list at its path as a plain list operation does, shares every other branch, and leaves its input as it was", async (context) => {
  await assertProperty(
    context,
    fc.property(listCase, ({ path, bags, operation }) => {
      const items = bags.map((bag) => bag[0]);
      const values = valuesWith(path, items);
      const before = structuredClone(values);
      const changed = changeListAt(path, operation, values);
      const inserted =
        operation.kind === "insert" || operation.kind === "replace" ? operation.item : undefined;

      expect(getPath(path, changed)).toStrictEqual(modelled(items, operation, inserted));
      expect(values).toStrictEqual(before);
      expect(changed.sibling).toBe(values.sibling);
    }),
  );
});

function anyOperationFor(length: number): fc.Arbitrary<ListOperation> {
  const anyIndex = fc.integer({ min: -1, max: length + 2 });
  return fc.oneof(
    fc.record({
      kind: fc.constant("insert" as const),
      item: fc.constant([]),
      index: fc.option(anyIndex, { nil: undefined }),
    }),
    fc.record({ kind: fc.constant("remove" as const), index: anyIndex }),
    fc.record({ kind: fc.constant("reorder" as const), from: anyIndex, to: anyIndex }),
    fc.record({ kind: fc.constant("replace" as const), index: anyIndex, item: fc.constant([]) }),
  );
}

function withHoles(bags: readonly Bag[], holes: readonly boolean[]): Bag[] {
  const holed = bags.slice();
  for (const [index, hole] of holes.entries()) {
    if (hole) Reflect.deleteProperty(holed, index);
  }
  return holed;
}

const anyListCase = listCase.chain((generated) =>
  fc.record({
    path: fc.constant(generated.path),
    bags: fc
      .array(fc.boolean(), {
        minLength: generated.bags.length,
        maxLength: generated.bags.length,
      })
      .map((holes) => withHoles(generated.bags, holes)),
    operation: anyOperationFor(generated.bags.length),
  }),
);

test("for any index, in range or not, the keys of each item move where the same operation moves the item in the list", async (context) => {
  await assertProperty(
    context,
    fc.property(anyListCase, ({ path, bags, operation }) => {
      const listed = getPath(path, changeListAt(path, operation, valuesWith(path, bags)));
      const moved = operation.kind === "replace" ? bags : listed;

      expect(Array.isArray(moved)).toBe(true);
      expect(moveListKeys(path, operation, keyedBy(path, bags), bags.length)).toStrictEqual(
        keyedBy(path, Array.isArray(moved) ? moved : []),
      );
    }),
  );
});

test("each list operation in range moves the keys of each item where the operation moves the item, drops those of a removed item, and keeps every key beside the list", async (context) => {
  await assertProperty(
    context,
    fc.property(listCase, ({ path, bags, operation }) => {
      const moved = operation.kind === "replace" ? bags : modelled(bags, operation, []);

      expect(moveListKeys(path, operation, keyedBy(path, bags), bags.length)).toStrictEqual(
        keyedBy(path, moved),
      );
    }),
  );
});
