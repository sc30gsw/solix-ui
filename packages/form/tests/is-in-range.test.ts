import { expect, test } from "vite-plus/test";
import { isInRange } from "#/src/is-in-range.ts";

const error = "is-in-range-error";

test("isInRange passes a number within its bounds", () => {
  expect(isInRange({ min: 2 }, error)(2)).toBeNull();
  expect(isInRange({ min: 2 }, error)(3)).toBeNull();
  expect(isInRange({ max: 2 }, error)(1)).toBeNull();
  expect(isInRange({ max: 2 }, error)(0)).toBeNull();
  expect(isInRange({ min: 2, max: 5 }, error)(4)).toBeNull();
});

test("isInRange fails a number outside its bounds and anything that is not a number", () => {
  for (const value of [0, 1, "2", null, []])
    expect(isInRange({ min: 2 }, error)(value)).toBe(error);
  expect(isInRange({ max: 2 }, error)(5)).toBe(error);
  expect(isInRange({ min: 2, max: 5 }, error)(8)).toBe(error);
  expect(isInRange({ min: 2, max: 5 }, error)(0)).toBe(error);
  expect(isInRange({ min: 2 })(0)).toBe(true);
});
