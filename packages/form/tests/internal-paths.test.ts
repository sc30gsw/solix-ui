import fc from "fast-check";
import { expect, expectTypeOf, test } from "vite-plus/test";
import {
  type FormPathValue,
  getPath,
  type Path,
  type PathValue,
  setPath,
  splitPath,
} from "#/src/internal-paths.ts";
import { type FormArrayElement, type LooseKeys } from "#/src/types.ts";
import { assertProperty } from "../../../tests/support/properties.ts";

const values = {
  name: "John",
  age: 42,
  description: ["male", "mid-age"],
  job: { title: "Engineer", permissions: { admin: false, user: true } },
  duties: [
    {
      title: "Drink coffee",
      when: [{ morning: true }, { afternoon: false }, { evening: false }],
      info: {
        active: true,
        activity: [
          { date: "yesterday", event: "log" },
          { date: "today", event: "log" },
        ],
      },
    },
    {
      title: "Do the job",
      when: [{ morning: false }, { afternoon: true }, { evening: false }],
      info: {
        active: true,
        activity: [
          { date: "yesterday", event: "log" },
          { date: "today", event: "log" },
        ],
      },
    },
  ],
};

const unsafeSegments = ["__proto__", "constructor", "prototype"];

test("splitPath splits a path at its dots", () => {
  expect(splitPath("a.b.0.c")).toStrictEqual(["a", "b", "0", "c"]);
});

test("splitPath gives no segments for a path that is not a string", () => {
  expect(splitPath(undefined)).toBeUndefined();
  expect(splitPath(null)).toBeUndefined();
  expect(splitPath(0)).toBeUndefined();
  expect(splitPath(Symbol("test"))).toBeUndefined();
});

test("splitPath gives no segments for a path with a segment that reaches a prototype", () => {
  for (const path of [
    "__proto__",
    "__proto__.polluted",
    "a.__proto__.polluted",
    "constructor.prototype.polluted",
    "a.constructor.prototype.polluted",
    "prototype.polluted",
  ]) {
    expect(splitPath(path), path).toBeUndefined();
  }
});

test("splitPath keeps a segment that holds an unsafe word inside it", () => {
  expect(splitPath("my__proto__field.constructorName")).toStrictEqual([
    "my__proto__field",
    "constructorName",
  ]);
});

test("getPath reads a property of the root", () => {
  expect(getPath("name", values)).toBe("John");
  expect(getPath("age", values)).toBe(42);
});

test("getPath reads a property of a nested object", () => {
  expect(getPath("job.title", values)).toBe("Engineer");
  expect(getPath("job.permissions", values)).toStrictEqual({ admin: false, user: true });
  expect(getPath("job.permissions.user", values)).toBe(true);
});

test("getPath reads a list item", () => {
  expect(getPath("description.0", values)).toBe("male");
  expect(getPath("description.1", values)).toBe("mid-age");
});

test("getPath reads a property of an object in a list", () => {
  expect(getPath("duties.0.title", values)).toBe("Drink coffee");
  expect(getPath("duties.1.title", values)).toBe("Do the job");
});

test("getPath reads through several levels of lists and objects", () => {
  expect(getPath("duties.0.when.0.morning", values)).toBe(true);
  expect(getPath("duties.1.info.activity.0.date", values)).toBe("yesterday");
});

test("getPath gives undefined for a path it cannot follow", () => {
  expect(getPath("random", values)).toBeUndefined();
  expect(getPath("name.random.path", values)).toBeUndefined();
  expect(getPath("duties.3.title", values)).toBeUndefined();
});

test("getPath gives undefined for values that are undefined or null", () => {
  expect(getPath("a.b.c", undefined)).toBeUndefined();
  expect(getPath("a.b.c", null)).toBeUndefined();
});

test("setPath sets a property of the root", () => {
  expect(setPath("name", "Jane", values)).toStrictEqual({ ...values, name: "Jane" });
  expect(setPath("age", 25, values)).toStrictEqual({ ...values, age: 25 });
});

test("setPath sets a list item", () => {
  expect(setPath("description.1", "young", values)).toStrictEqual({
    ...values,
    description: ["male", "young"],
  });
  expect(setPath("description.0", "female", values)).toStrictEqual({
    ...values,
    description: ["female", "mid-age"],
  });
});

test("setPath sets a property of a nested object", () => {
  expect(setPath("job.permissions.user", false, values)).toStrictEqual({
    ...values,
    job: { title: "Engineer", permissions: { admin: false, user: false } },
  });
});

test("setPath sets a property deep in lists and objects, and keeps every branch it does not cross", () => {
  const written = setPath("duties.1.info.activity.0.event", "test", values);

  expect(written).toStrictEqual({
    ...values,
    duties: [
      values.duties[0],
      {
        ...values.duties[1],
        info: {
          active: true,
          activity: [
            { date: "yesterday", event: "test" },
            { date: "today", event: "log" },
          ],
        },
      },
    ],
  });
  expect(written.duties[0]).toBe(values.duties[0]);
  expect(written.duties[1].when).toBe(values.duties[1].when);
  expect(written.job).toBe(values.job);
  expect(values.duties[1].info.activity[0].event).toBe("log");
});

test("setPath writes nothing to Object.prototype through a path that reaches it", () => {
  for (const path of ["__proto__.polluted", "constructor.prototype.polluted"]) {
    const target = { name: "" };

    expect(setPath(path, "YES", target)).toBe(target);
    expect(Reflect.get({}, "polluted")).toBeUndefined();
  }
});

test("setPath changes nothing when a parent on the path is missing, null or not an object", () => {
  const target = { a: { b: null }, c: 1, list: [{ d: 1 }] };

  for (const path of ["x.y", "x.y.z", "a.b.c", "c.d", "list.4.d", "a.missing.deep.path"]) {
    expect(setPath(path, 2, target), path).toBe(target);
  }
  expect(setPath("a.b", 1, undefined)).toBeUndefined();
  expect(setPath("a", 1, "text")).toBe("text");
});

test("setPath returns the same values when the value at the path is already the one given", () => {
  expect(setPath("job.permissions.user", true, values)).toBe(values);
});

test("setPath keeps the prototype of each object it copies", () => {
  class Point {
    x = 1;
  }
  const target = { point: new Point() };
  const written = setPath("point.x", 2, target);

  expect(written.point).toBeInstanceOf(Point);
  expect(written.point.x).toBe(2);
  expect(target.point.x).toBe(1);
});

test("path types name every path into the values, read the value at a path, and leave any other string loose", () => {
  type Values = { name: string; jobs: { title: string; tags: string[] }[]; pair: [number, string] };

  expectTypeOf<"name" | "jobs.0.title" | "jobs.3.tags.1" | "pair.1">().toExtend<Path<Values>>();
  expectTypeOf<PathValue<Values, "jobs.2.title">>().toEqualTypeOf<string>();
  expectTypeOf<PathValue<Values, "pair.1">>().toEqualTypeOf<string>();
  expectTypeOf<FormPathValue<Values, "nowhere">>().toEqualTypeOf<unknown>();
  expectTypeOf<FormArrayElement<Values, "jobs">>().toEqualTypeOf<{
    title: string;
    tags: string[];
  }>();
  expectTypeOf<FormArrayElement<Values, "name">>().toEqualTypeOf<unknown>();
  expectTypeOf<"anything.at.all">().toExtend<LooseKeys<Values>>();
});

const segmentKey = fc.constantFrom("a", "b", "c", "list");

const leaf = fc.oneof(fc.integer(), fc.string({ maxLength: 3 }), fc.boolean(), fc.constant(null));

const { root } = fc.letrec((tie) => ({
  root: fc.dictionary(segmentKey, tie("node"), { maxKeys: 4 }),
  node: fc.oneof({ depthSize: "small" }, leaf, tie("object"), tie("list")),
  object: fc.dictionary(segmentKey, tie("node"), { maxKeys: 3 }),
  list: fc.array(tie("node"), { maxLength: 3 }),
}));

type Entry = { path: string; value: unknown };

function entriesOf(node: unknown, prefix = ""): Entry[] {
  if (typeof node !== "object" || node === null) return [];
  return Object.entries(node).flatMap(([key, value]) => {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    return [{ path, value }, ...entriesOf(value, path)];
  });
}

function isUnder(path: string, ancestor: string): boolean {
  return path === ancestor || path.startsWith(`${ancestor}.`);
}

const marker = { written: true };

test("getPath reads, at every path of generated values, the value a plain walk of them finds", async (context) => {
  await assertProperty(
    context,
    fc.property(root, (generated) => {
      for (const { path, value } of entriesOf(generated)) {
        expect(getPath(path, generated), path).toBe(value);
      }
    }),
  );
});

test("setPath on a path whose parent exists gives a copy that holds the value there, shares every branch it does not cross, and leaves its input as it was", async (context) => {
  const target = root.chain((generated) => {
    const containers = [
      "",
      ...entriesOf(generated)
        .filter(({ value }) => typeof value === "object" && value !== null)
        .map(({ path }) => path),
    ];
    return fc.record({
      generated: fc.constant(generated),
      parent: fc.constantFrom(...containers),
      key: fc.constantFrom("a", "b", "z", "0", "1", "5"),
    });
  });

  await assertProperty(
    context,
    fc.property(target, ({ generated, parent, key }) => {
      const before = structuredClone(generated);
      const path = parent === "" ? key : `${parent}.${key}`;
      const written = setPath(path, marker, generated);

      expect(getPath(path, written)).toBe(marker);
      expect(generated).toEqual(before);
      for (const entry of entriesOf(generated)) {
        if (isUnder(entry.path, path) || isUnder(path, entry.path)) continue;
        expect(getPath(entry.path, written), entry.path).toBe(entry.value);
      }
    }),
  );
});

test("setPath returns its input itself for a path through a missing or scalar parent, or with a segment that reaches a prototype", async (context) => {
  const target = root.chain((generated) => {
    const leaves = entriesOf(generated)
      .filter(({ value }) => typeof value !== "object" || value === null)
      .map(({ path }) => path);
    return fc.record({
      generated: fc.constant(generated),
      path: fc.oneof(
        fc.constantFrom(...leaves, "missing").map((path) => `${path}.x.y`),
        fc
          .tuple(fc.constantFrom(...unsafeSegments), fc.constantFrom("", "a.", "a.b."))
          .map(([unsafe, prefix]) => `${prefix}${unsafe}.polluted`),
      ),
    });
  });

  await assertProperty(
    context,
    fc.property(target, ({ generated, path }) => {
      expect(setPath(path, marker, generated), path).toBe(generated);
      expect(Reflect.get({}, "polluted")).toBeUndefined();
    }),
  );
});

test("setPath writes a list's length as an assignment does, so setting it shortens a copy of the list", () => {
  const target = { a: [1, 2, 3] };

  expect(setPath("a.length", 1, target)).toStrictEqual({ a: [1] });
  expect(target.a).toStrictEqual([1, 2, 3]);
});

test("getPath reads only own properties, so a path never reaches what a prototype holds", () => {
  expect(getPath("toString", {})).toBeUndefined();
  expect(getPath("a.hasOwnProperty", { a: {} })).toBeUndefined();
  expect(getPath("list.map", { list: [] })).toBeUndefined();
  expect(getPath("name.length", { name: "John" })).toBe(4);
  expect(getPath("list.length", { list: [1, 2] })).toBe(2);
});
