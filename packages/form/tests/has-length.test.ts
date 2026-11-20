import { expect, test } from "vite-plus/test";
import { hasLength } from "#/src/has-length.ts";

const error = "has-length-error";

test("hasLength passes a value whose length is the one given or within the bounds given", () => {
  const exact = hasLength(3, error);
  const atLeast = hasLength({ min: 2 }, error);
  const atMost = hasLength({ max: 3 }, error);
  const between = hasLength({ min: 1, max: 3 }, error);

  for (const value of ["hel", [1, 2, 3], { length: 3 }]) expect(exact(value)).toBeNull();
  for (const value of ["test", [1, 2], { length: 2 }]) expect(atLeast(value)).toBeNull();
  for (const value of ["tes", "te", [1, 2, 3], { length: 2 }]) expect(atMost(value)).toBeNull();
  for (const value of ["t", "te", "tes", [1, 2], { length: 3 }]) expect(between(value)).toBeNull();
});

test("hasLength fails a value of another length, a string too long once trimmed, and a value with no length", () => {
  const exact = hasLength(3, error);
  const atLeast = hasLength({ min: 2 }, error);
  const atMost = hasLength({ max: 3 }, error);
  const between = hasLength({ min: 1, max: 3 }, error);

  for (const value of ["test", [1, 2, 3, 4], { length: 5 }, null, undefined, {}]) {
    expect(exact(value)).toBe(error);
  }
  for (const value of ["t", "", " ", [1], { length: 0 }]) expect(atLeast(value)).toBe(error);
  for (const value of ["test", "test-1", [1, 2, 3, 4, 5], { length: 4 }]) {
    expect(atMost(value)).toBe(error);
  }
  for (const value of ["test", "", [1, 2, 3, 4], { length: 0 }]) expect(between(value)).toBe(error);
  expect(hasLength(1)("")).toBe(true);
});
