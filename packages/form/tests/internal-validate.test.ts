import fc from "fast-check";
import { expect, test, vi } from "vite-plus/test";
import { FORM_INDEX, formRootRule } from "#/src/constants.ts";
import {
  isThenable,
  messageOf,
  ruleForPath,
  runRule,
  shouldValidateOnChange,
  validateFieldValue,
  validateValues,
} from "#/src/internal-validate.ts";
import { type FormValidateInput } from "#/src/types.ts";
import { assertProperty } from "../../../tests/support/properties.ts";

const below2 = (error: string) => (value: unknown) =>
  typeof value === "number" && value < 2 ? error : null;

test("shouldValidateOnChange follows a boolean setting", () => {
  expect(shouldValidateOnChange("field", true)).toBe(true);
  expect(shouldValidateOnChange("field", false)).toBe(false);
});

test("shouldValidateOnChange validates a path a list of paths names, digits in a name included", () => {
  expect(shouldValidateOnChange("field", ["field", "other-field"])).toBe(true);
  expect(shouldValidateOnChange("field", ["other-field", "other-field-2"])).toBe(false);
  expect(shouldValidateOnChange("field2", ["field2", "other-field"])).toBe(true);
  expect(shouldValidateOnChange("other-field-2", ["field2", "other-field-2"])).toBe(true);
});

test("shouldValidateOnChange matches each list index of a path to FORM_INDEX", () => {
  expect(shouldValidateOnChange("field.2.name", [`field.${FORM_INDEX}.name`])).toBe(true);
  expect(
    shouldValidateOnChange("field.2.name.4.id", [`field.${FORM_INDEX}.name.${FORM_INDEX}.id`]),
  ).toBe(true);
  expect(
    shouldValidateOnChange("field.name.4.id", [`field.${FORM_INDEX}.name.${FORM_INDEX}`]),
  ).toBe(false);
});

test("validateFieldValue runs the rule of a field at the root", async () => {
  expect(
    await validateFieldValue(
      "a",
      { a: (value) => (value === 1 ? "error-a" : null) },
      { a: 1, b: 2 },
    ),
  ).toStrictEqual({ hasError: true, error: "error-a" });
});

test("validateFieldValue with a validate function gives the error of the field it names, if any", async () => {
  expect(await validateFieldValue("a", () => ({ a: "error-a" }), { a: 1, b: 2 })).toStrictEqual({
    hasError: true,
    error: "error-a",
  });
  expect(await validateFieldValue("b", () => ({ a: "error-a" }), { a: 1, b: 2 })).toStrictEqual({
    hasError: false,
    error: null,
  });
});

test("validateFieldValue runs the rule of a nested field", async () => {
  expect(
    await validateFieldValue(
      "a.b",
      { a: { b: (value) => (value === 1 ? "error-b" : null) } },
      { a: { b: 1 } },
    ),
  ).toStrictEqual({ hasError: true, error: "error-b" });
});

test("validateFieldValue for a path with no rule of its own gives the first error under it", async () => {
  expect(
    await validateFieldValue(
      "a",
      { a: { b: (value: unknown) => (value === 1 ? "error-b" : null) } },
      { a: [{ b: 2 }, { b: 1 }] },
    ),
  ).toStrictEqual({ hasError: true, error: "error-b" });
});

test("validateFieldValue runs the rule of a field in a list item", async () => {
  expect(
    await validateFieldValue(
      "a.1.b",
      { a: { b: (value: unknown) => (value === 1 ? "error-b" : null) } },
      { a: [{ b: 2 }, { b: 1 }, { b: 3 }] },
    ),
  ).toStrictEqual({ hasError: true, error: "error-b" });
});

test("validateFieldValue answers at once when every rule it runs does, and gives no error for a path that is not a string", () => {
  expect(validateFieldValue("a", { a: () => "now" }, { a: 1 })).toStrictEqual({
    hasError: true,
    error: "now",
  });
  expect(validateFieldValue(1, { a: () => "now" }, { a: 1 })).toStrictEqual({
    hasError: false,
    error: null,
  });
});

test("validateValues gives no errors when no rule fails", async () => {
  expect(
    await validateValues(
      {
        a: (value) => (value === 1 ? null : "error-a"),
        b: (value) => (value === 1 ? null : "error-b"),
      },
      { a: 1, b: 1 },
    ),
  ).toStrictEqual({ hasErrors: false, errors: {} });
});

test("validateValues takes the errors of a validate function, which it calls with the values", async () => {
  const validate = vi.fn(() => ({ a: "error-a", b: "error-b" }));

  expect(await validateValues(validate, { a: 1, b: 2 })).toStrictEqual({
    hasErrors: true,
    errors: { a: "error-a", b: "error-b" },
  });
  expect(validate).toHaveBeenCalledWith({ a: 1, b: 2 });
  expect(await validateValues(() => ({}), { a: 1, b: 2 })).toStrictEqual({
    hasErrors: false,
    errors: {},
  });
});

test("validateValues runs a rule per property of the root, with the value and all values", async () => {
  expect(
    await validateValues(
      {
        a: (value) => (value < 2 ? "error-a" : null),
        b: (value) => (value === "" ? null : "error-b"),
        c: (_value, values) => (values.b === "" ? "error-c" : null),
      },
      { a: 1, b: "", c: "" },
    ),
  ).toStrictEqual({ hasErrors: true, errors: { a: "error-a", c: "error-c" } });
});

test("validateValues runs a rule on a whole list", async () => {
  expect(
    await validateValues(
      {
        a: (value) => (value < 2 ? "error-a" : null),
        b: (value) => (value.length === 0 ? "error-b" : null),
        c: (value) => (value.length === 0 ? "error-c" : null),
      },
      { a: 1, b: [] as number[], c: [1, 2, 3] },
    ),
  ).toStrictEqual({ hasErrors: true, errors: { a: "error-a", b: "error-b" } });
});

test("validateValues runs the rules of a list's item on each item", async () => {
  expect(
    await validateValues(
      {
        a: below2("error-a"),
        b: { c: below2("error-c"), d: (value) => (value === "" ? "error-d" : null) },
      },
      {
        a: 1,
        b: [
          { c: 1, d: "" },
          { c: 2, d: "1" },
          { c: 1, d: "1" },
          { c: 3, d: "" },
        ],
      },
    ),
  ).toStrictEqual({
    hasErrors: true,
    errors: {
      a: "error-a",
      "b.0.c": "error-c",
      "b.0.d": "error-d",
      "b.2.c": "error-c",
      "b.3.d": "error-d",
    },
  });
});

test("validateValues runs the rules of nested objects, of nested lists, and of both mixed", async () => {
  expect(
    await validateValues(
      {
        a: {
          b: (value) => (value === 1 ? "error-b" : null),
          c: { d: (value) => (value === 1 ? "error-d" : null) },
        },
      },
      { a: { b: 1, c: { d: 1 } } },
    ),
  ).toStrictEqual({ hasErrors: true, errors: { "a.b": "error-b", "a.c.d": "error-d" } });
  expect(
    await validateValues(
      { a: { b: { c: below2("error-c") } } },
      { a: [{ b: [{ c: 1 }, { c: 2 }] }, { b: [{ c: 3 }, { c: 1 }] }] },
    ),
  ).toStrictEqual({ hasErrors: true, errors: { "a.0.b.0.c": "error-c", "a.1.b.1.c": "error-c" } });
  expect(
    await validateValues(
      { a: { b: { c: { d: { e: (value) => (value !== 1 ? "error-e" : null) } } } } },
      { a: { b: [{ c: { d: { e: 1 } } }, { c: { d: { e: 2 } } }] } },
    ),
  ).toStrictEqual({ hasErrors: true, errors: { "a.b.1.c.d.e": "error-e" } });
});

test("validateValues gives each rule the path of the value it validates", async () => {
  expect(
    await validateValues(
      { a: { b: { c: (_value, _values, path) => (path === "a.b.0.c" ? "error" : null) } } },
      { a: { b: [{ c: 1 }, { c: 2 }] } },
    ),
  ).toStrictEqual({ hasErrors: true, errors: { "a.b.0.c": "error" } });
});

test("validateValues runs the root rule of a nested object", async () => {
  expect(
    await validateValues(
      { a: { [formRootRule]: (value) => (value.b === 0 ? "error" : null) } },
      { a: { b: 0 } },
    ),
  ).toStrictEqual({ hasErrors: true, errors: { a: "error" } });
  expect(
    await validateValues(
      { a: { b: { [formRootRule]: (value) => (value.c === 0 ? "error" : null) } } },
      { a: { b: { c: 0 } } },
    ),
  ).toStrictEqual({ hasErrors: true, errors: { "a.b": "error" } });
  expect(
    await validateValues(
      { a: { [formRootRule]: (value) => (value.b === 0 ? "error" : null) } },
      { a: { b: 1 } },
    ),
  ).toStrictEqual({ hasErrors: false, errors: {} });
});

test("validateValues runs the root rule of a nested list once, on the whole list", async () => {
  const root = vi.fn((value: { b: number }[]) => (value.length === 2 ? "error" : null));

  expect(
    await validateValues({ a: { [formRootRule]: root } }, { a: [{ b: 0 }, { b: 1 }] }),
  ).toStrictEqual({ hasErrors: true, errors: { a: "error" } });
  expect(root).toHaveBeenCalledTimes(1);
  expect(await validateValues({ a: { [formRootRule]: root } }, { a: [{ b: 0 }] })).toStrictEqual({
    hasErrors: false,
    errors: {},
  });
});

test("validateValues answers at once when every rule does, and with a promise when any rule does", async () => {
  const rules = { a: () => "now", b: { c: async () => "later" } };

  expect(validateValues({ a: () => "now" }, { a: 0 })).toStrictEqual({
    hasErrors: true,
    errors: { a: "now" },
  });
  const pending = validateValues(rules, { a: 0, b: { c: 1 } });
  expect(isThenable(pending)).toBe(true);
  expect(await pending).toStrictEqual({ hasErrors: true, errors: { a: "now", "b.c": "later" } });
  expect(isThenable(validateValues(async () => ({}), { a: 0 }))).toBe(true);
});

test("a rule that throws or rejects gives the error resolveValidationError makes of it, the message of an Error by default", async () => {
  const failing = {
    thrown: () => {
      throw new Error("thrown");
    },
    rejected: () => Promise.reject(new Error("rejected")),
    other: () => Promise.reject("plain"),
  };
  const failingValues = { thrown: 0, rejected: 0, other: 0 };

  expect(await validateValues(failing, failingValues)).toStrictEqual({
    hasErrors: true,
    errors: { thrown: "thrown", rejected: "rejected", other: "plain" },
  });
  expect(
    await validateValues(failing, failingValues, (error) => `resolved ${messageOf(error)}`),
  ).toStrictEqual({
    hasErrors: true,
    errors: { thrown: "resolved thrown", rejected: "resolved rejected", other: "resolved plain" },
  });
  expect(await validateFieldValue("thrown", failing, failingValues)).toStrictEqual({
    hasError: true,
    error: "thrown",
  });
  expect(await validateFieldValue("rejected", failing, failingValues, () => null)).toStrictEqual({
    hasError: false,
    error: null,
  });
});

test("runRule hands the rule the value at its path, the values, the path and the signal", () => {
  const signal = new AbortController().signal;
  const rule = vi.fn(() => null);
  const values = { a: [{ b: 4 }] };

  expect(runRule(rule, "a.0.b", { values, resolve: messageOf, signal })).toBeNull();

  expect(rule).toHaveBeenCalledWith(4, values, "a.0.b", signal);
});

test("ruleForPath walks the rules beside the values by the path's segments, stepping into a list's item rules at an index", () => {
  const rule = () => null;
  const rules = { a: { b: rule }, c: rule };
  const values = { a: [{}, {}, {}, { b: 1 }], c: 1 };

  expect(ruleForPath("a.3.b", rules, values)).toBe(rule);
  expect(ruleForPath("c", rules, values)).toBe(rule);
  expect(ruleForPath("a", rules, values)).toBeUndefined();
  expect(ruleForPath("c.d", rules, values)).toBeUndefined();
  expect(ruleForPath("x.y", undefined, values)).toBeUndefined();
});

test("validateValues gives no errors for a validate function that returns null or undefined", async () => {
  const none = () => null as unknown as Record<string, string>;

  expect(validateValues(none, { a: 0 })).toStrictEqual({ hasErrors: false, errors: {} });
  expect(await validateValues(async () => none(), { a: 0 })).toStrictEqual({
    hasErrors: false,
    errors: {},
  });
});

test("a rule is found only among the rules' own properties, never on their prototype", async () => {
  const inherited = Object.create({ [formRootRule]: () => "inherited", b: () => "inherited" });

  expect(validateFieldValue("toString", {}, { toString: 1 })).toStrictEqual({
    hasError: false,
    error: null,
  });
  expect(ruleForPath("constructor", {}, {})).toBeUndefined();
  expect(validateValues({ a: inherited }, { a: { b: 1 } })).toStrictEqual({
    hasErrors: false,
    errors: {},
  });
});

test("validateFieldValue of a list item does not run the rule of the whole list on it", () => {
  const rules = { tags: (value: unknown) => (Array.isArray(value) ? null : "not a list") };
  const values = { tags: ["a", "b"] };

  expect(validateValues(rules, values)).toStrictEqual({ hasErrors: false, errors: {} });
  expect(validateFieldValue("tags.0", rules, values)).toStrictEqual({
    hasError: false,
    error: null,
  });
});

const ruleKey = fc.constantFrom("a", "b", "list");

const oddRule = (_value: unknown, _values: unknown, path: string) => path;

const { rules: generatedRules } = fc.letrec((tie) => ({
  rules: fc.dictionary(
    ruleKey,
    fc.oneof({ depthSize: "small" }, fc.constant(oddRule), tie("rules")),
    {
      maxKeys: 3,
    },
  ),
}));

const { node: generatedValue } = fc.letrec((tie) => ({
  node: fc.oneof(
    { depthSize: "small" },
    fc.integer(),
    fc.dictionary(ruleKey, tie("node"), { maxKeys: 3 }),
    fc.array(tie("node"), { maxLength: 3 }),
  ),
}));

const fieldPath = fc
  .array(fc.oneof(ruleKey, fc.constantFrom("0", "1")), { minLength: 1, maxLength: 4 })
  .map((segments) => segments.join("."));

function firstErrorAtOrUnder(path: string, errors: Record<string, unknown>) {
  const key = Object.keys(errors).find((each) => each === path || each.startsWith(`${path}.`));
  return key === undefined
    ? { hasError: false, error: null }
    : { hasError: true, error: errors[key] };
}

test("validateFieldValue gives, for generated rules, values and paths, the first error validateValues gives at or under the path", async (context) => {
  await assertProperty(
    context,
    fc.property(generatedRules, generatedValue, fieldPath, (generated, values: unknown, path) => {
      const rules = generated as FormValidateInput<unknown>;
      const all = validateValues(rules, values);
      if (isThenable(all)) throw new Error("the generated rules are synchronous");

      expect(validateFieldValue(path, rules, values)).toStrictEqual(
        firstErrorAtOrUnder(path, all.errors),
      );
    }),
  );
});

test("an empty string and 0 are errors on every path, as filterErrors keeps them", () => {
  const rules = { a: () => "", b: () => 0 };

  expect(validateValues(rules, { a: 1, b: 1 })).toStrictEqual({
    hasErrors: true,
    errors: { a: "", b: 0 },
  });
  expect(validateFieldValue("a", rules, { a: 1, b: 1 })).toStrictEqual({
    hasError: true,
    error: "",
  });
  expect(validateFieldValue("b", rules, { a: 1, b: 1 })).toStrictEqual({
    hasError: true,
    error: 0,
  });
});
