import { expect, test } from "vite-plus/test";
import { isOneOf } from "#/src/is-one-of.ts";

const error = "is-one-of-error";

test("isOneOf passes a value of its list and fails any other, by strict equality", () => {
  const roles = isOneOf(["admin", "user", "moderator"], error);
  const numbers = isOneOf([1, 2, 3], error);

  for (const value of ["admin", "user", "moderator"]) expect(roles(value)).toBeNull();
  for (const value of ["guest", "", "Admin"]) expect(roles(value)).toBe(error);
  expect(numbers(1)).toBeNull();
  expect(numbers(2)).toBeNull();
  for (const value of [4, 0, "1", true]) expect(numbers(value)).toBe(error);
});

test("isOneOf takes booleans, null and NaN as list members", () => {
  expect(isOneOf([true], error)(true)).toBeNull();
  expect(isOneOf([true], error)(false)).toBe(error);
  expect(isOneOf([null, "a"], error)(null)).toBeNull();
  expect(isOneOf([null, "a"], error)("a")).toBeNull();
  expect(isOneOf([null, "a"], error)(undefined)).toBe(error);
  expect(isOneOf([Number.NaN], error)(Number.NaN)).toBeNull();
});

test("isOneOf with an empty list fails everything, and fails with true when no error is given", () => {
  for (const value of ["anything", null, undefined]) expect(isOneOf([], error)(value)).toBe(error);
  expect(isOneOf(["a", "b"])("c")).toBe(true);
  expect(isOneOf(["a", "b"])("a")).toBeNull();
});
