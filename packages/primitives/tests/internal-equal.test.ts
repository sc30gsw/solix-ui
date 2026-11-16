import { expect, test } from "vite-plus/test";
import { sameValue, sameItems, sameKeys } from "../src/internal-equal";

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

test("sameValue compares plain objects and arrays by value, symbol keys included, and anything else by identity, and an absent key differs from one set to undefined", () => {
  const key = Symbol("key");
  const element = {};
  const signal = new AbortController().signal;

  expect(sameValue({ box: "border-box" }, { box: "border-box" })).toBe(true);
  expect(sameValue({ threshold: [0, 1], [key]: 1 }, { threshold: [0, 1], [key]: 1 })).toBe(true);
  expect(sameValue({ [key]: 1 }, { [key]: 2 })).toBe(false);
  expect(sameValue({ signal }, { signal })).toBe(true);
  expect(sameValue({ signal }, { signal: new AbortController().signal })).toBe(false);
  expect(sameValue({ root: element }, { root: element })).toBe(true);
  expect(sameValue(new Map(), new Map())).toBe(false);
  expect(sameValue({ once: undefined }, {})).toBe(false);
  expect(sameValue([0, [1]], [0, [1]])).toBe(true);
  expect(sameValue(Number.NaN, Number.NaN)).toBe(true);
});
