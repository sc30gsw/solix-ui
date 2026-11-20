import { expect, test } from "vite-plus/test";
import { matchesField } from "#/src/matches-field.ts";

const error = "matches-field-error";

test("matchesField fails a value that differs from the field's, or values without the field", () => {
  const validator = matchesField<Record<string, string>>("testField", error);

  expect(validator("test-value", { testField: "test-value-1" })).toBe(error);
  expect(validator("test-value", { testField2: "test-value" })).toBe(error);
  expect(matchesField("testField")("a", { testField: "b" })).toBe(true);
});

test("matchesField passes a value identical to the field's", () => {
  expect(matchesField("testField", error)("test-value", { testField: "test-value" })).toBeNull();
});
