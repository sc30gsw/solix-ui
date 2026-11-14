import { expect, test } from "vite-plus/test";
import { sameItems, sameKeys } from "../src/internal-equal";

test("sameItems compares two lists item by item with Object.is", () => {
  const shared = {};

  expect(sameItems([1, shared, Number.NaN], [1, shared, Number.NaN])).toBe(true);
  expect(sameItems([1, {}], [1, {}])).toBe(false);
  expect(sameItems([1], [1, 2])).toBe(false);
  expect(sameItems([0], [-0])).toBe(false);
});

test("sameKeys compares two objects key by key with Object.is, an absent key against undefined included", () => {
  const signal = new AbortController().signal;

  expect(sameKeys({ type: "a", signal }, { type: "a", signal })).toBe(true);
  expect(sameKeys({ type: "a" }, { type: "b" })).toBe(false);
  expect(
    sameKeys<{ type: string; once?: boolean }>({ type: "a" }, { type: "a", once: undefined }),
  ).toBe(false);
  expect(sameKeys({ value: {} }, { value: {} })).toBe(false);
});
