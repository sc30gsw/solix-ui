import { expect, test } from "vite-plus/test";
import { matches } from "#/src/matches.ts";

const error = "matches-error";

test("matches fails a string the expression does not match, and a value that is not a string", () => {
  for (const value of ["test", "12test", "test21", 12])
    expect(matches(/^\d+$/, error)(value)).toBe(error);
  expect(matches(/^\d+$/)("test")).toBe(true);
});

test("matches passes a string the expression matches", () => {
  expect(matches(/^\d+$/, error)("1")).toBeNull();
  expect(matches(/^\d+$/, error)("1234")).toBeNull();
});
