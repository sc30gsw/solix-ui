import { expect, test } from "vite-plus/test";
import { allOrNow, isThenable, thenOrNow } from "#/src/internal-outcome.ts";

test("thenOrNow continues at once with a value and after a promise with what it settles to", async () => {
  const pending = thenOrNow(Promise.resolve(2), (value) => value * 3);

  expect(thenOrNow(2, (value) => value * 3)).toBe(6);
  expect(isThenable(pending)).toBe(true);
  expect(await pending).toBe(6);
});

test("allOrNow continues at once when no value is a promise, and after all of them otherwise", async () => {
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const pending = allOrNow([1, Promise.resolve(2), 3], sum);

  expect(allOrNow([1, 2, 3], sum)).toBe(6);
  expect(isThenable(pending)).toBe(true);
  expect(await pending).toBe(6);
});

test("isThenable takes a promise and nothing that is not one", () => {
  expect(isThenable(Promise.resolve())).toBe(true);
  expect(isThenable(1)).toBe(false);
  expect(isThenable({})).toBe(false);
  expect(isThenable(null)).toBe(false);
});
