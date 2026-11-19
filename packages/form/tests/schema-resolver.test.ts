import { expect, expectTypeOf, test } from "vite-plus/test";
import { schemaResolver } from "#/src/schema-resolver.ts";
import { type FormErrors, type StandardSchema, type StandardSchemaIssue } from "#/src/types.ts";

function schemaOf(
  check: (values: Record<string, unknown>) => StandardSchemaIssue[],
  wait = false,
): StandardSchema {
  return {
    "~standard": {
      validate: (value) => {
        const issues = check(Object(value));
        const result = issues.length === 0 ? { value } : { issues };
        return wait ? Promise.resolve(result) : result;
      },
    },
  };
}

const tooShort = (path: PropertyKey[], text: unknown, message: string): StandardSchemaIssue[] =>
  typeof text === "string" && text.length < 2 ? [{ message, path }] : [];

test("a resolved schema gives each issue's message under its field", () => {
  const validate = schemaResolver(
    schemaOf((values) => [
      ...tooShort(["name"], values.name, "Name too short"),
      ...(values.email === "" ? [{ message: "Invalid email", path: ["email"] }] : []),
      ...(Number(values.age) < 18 ? [{ message: "Too young", path: ["age"] }] : []),
    ]),
    { sync: true },
  );

  expect(validate({ name: "", email: "", age: 10 })).toStrictEqual({
    name: "Name too short",
    email: "Invalid email",
    age: "Too young",
  });
  expect(validate({ name: "John", email: "a@b.cd", age: 20 })).toStrictEqual({});
});

test("a resolved schema joins the path of a nested field or a list item with dots", () => {
  const validate = schemaResolver(
    schemaOf((values) => [
      ...tooShort(["nested", "field"], Object(values.nested).field, "Field too short"),
      ...tooShort(["list", 0, "name"], Object(Object(values.list)[0]).name, "Name too short"),
    ]),
    { sync: true },
  );

  expect(validate({ nested: { field: "" }, list: [{ name: "" }] })).toStrictEqual({
    "nested.field": "Field too short",
    "list.0.name": "Name too short",
  });
});

test("a resolved schema reads path segments given as objects with a key, mixed with plain ones", () => {
  const validate = schemaResolver(
    schemaOf(() => [
      { message: "Error", path: [{ key: "nested" }, { key: "field" }] },
      { message: "Mixed", path: ["list", { key: 0 }, { key: "name" }] },
    ]),
    { sync: true },
  );

  expect(validate({})).toStrictEqual({ "nested.field": "Error", "list.0.name": "Mixed" });
});

test("a resolved schema joins an issue's path as a rules record's keys join, an empty first segment naming the root", () => {
  const validate = schemaResolver(
    schemaOf(() => [{ message: "Inner", path: ["", "inner"] }]),
    {
      sync: true,
    },
  );

  expect(validate({})).toStrictEqual({ inner: "Inner" });
});

test("a resolved schema puts an issue with no path under the empty key, and keeps the first message of a path", () => {
  const validate = schemaResolver(
    schemaOf(() => [
      { message: "Root error" },
      { message: "First error", path: ["field"] },
      { message: "Second error", path: ["field"] },
    ]),
    { sync: true },
  );

  expect(validate({})).toStrictEqual({ "": "Root error", field: "First error" });
});

test("a resolved schema returns a promise for a schema that validates asynchronously, or without sync", async () => {
  const issues = () => [{ message: "Error", path: ["field"] }];
  const pending = schemaResolver(schemaOf(issues))({});

  expect(pending).toBeInstanceOf(Promise);
  expect(await pending).toStrictEqual({ field: "Error" });
  expect(await schemaResolver(schemaOf(issues, true))({})).toStrictEqual({ field: "Error" });
  expect(await schemaResolver(schemaOf(() => [], true))({})).toStrictEqual({});
});

test("with sync, a resolved schema still returns a promise for a schema that validates asynchronously, as its type says", async () => {
  const validate = schemaResolver(
    schemaOf(() => [{ message: "Later", path: ["field"] }], true),
    { sync: true },
  );
  const pending = validate({});

  expectTypeOf(validate).returns.toEqualTypeOf<FormErrors | Promise<FormErrors>>();
  expect(pending).toBeInstanceOf(Promise);
  expect(await pending).toStrictEqual({ field: "Later" });
});

test("the type of a resolved schema without sync says it returns a promise", () => {
  expectTypeOf(schemaResolver(schemaOf(() => []))).returns.toEqualTypeOf<Promise<FormErrors>>();
});
