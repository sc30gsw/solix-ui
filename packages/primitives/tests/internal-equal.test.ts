import { expect, test } from "vite-plus/test";
import { sameConfig, sameItems, sameKeys } from "../src/internal-equal";

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

test("sameConfig compares plain objects and arrays by value, symbol keys included, and anything else by identity", () => {
  const key = Symbol("key");
  const element = {};
  const signal = new AbortController().signal;

  expect(sameConfig({ box: "border-box" }, { box: "border-box" })).toBe(true);
  expect(sameConfig({ threshold: [0, 1], [key]: 1 }, { threshold: [0, 1], [key]: 1 })).toBe(true);
  expect(sameConfig({ [key]: 1 }, { [key]: 2 })).toBe(false);
  expect(sameConfig({ signal }, { signal })).toBe(true);
  expect(sameConfig({ signal }, { signal: new AbortController().signal })).toBe(false);
  expect(sameConfig({ root: element }, { root: element })).toBe(true);
  expect(sameConfig(new Map(), new Map())).toBe(false);
  expect(sameConfig({ once: undefined }, {})).toBe(false);
  expect(sameConfig([0, [1]], [0, [1]])).toBe(true);
  expect(sameConfig(Number.NaN, Number.NaN)).toBe(true);
});
