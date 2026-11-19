import { expect, test } from "vite-plus/test";
import { isNotEmpty } from "#/src/is-not-empty.ts";

const error = "not-empty-error";

test("isNotEmpty fails an empty or blank string, an empty list, null, undefined and false", () => {
  for (const value of ["", "  ", null, undefined, [], false])
    expect(isNotEmpty(error)(value)).toBe(error);
  expect(isNotEmpty()("")).toBe(true);
});

test("isNotEmpty passes any other value", () => {
  for (const value of ["1", " 1 ", [1, 2, 3], 0, 10, Number.NaN, true]) {
    expect(isNotEmpty(error)(value)).toBeNull();
  }
});

test("isNotEmpty fails with an error of an empty string or 0 as given, as these are errors", () => {
  expect(isNotEmpty("")("")).toBe("");
  expect(isNotEmpty(0)(null)).toBe(0);
  expect(isNotEmpty(false)(null)).toBe(true);
});
