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
