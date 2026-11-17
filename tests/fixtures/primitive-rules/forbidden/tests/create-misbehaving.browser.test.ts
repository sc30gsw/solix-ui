import { expect, test } from "vite-plus/test";
import { lookUp } from "#/packages/primitives/src/internal-browser-api.ts";
import "#/tests/fixtures/primitive-rules/forbidden/tests/support/browser-harness.ts";

test("waits by itself", async () => {
  const seen: string[] = [];
  await expect.poll(() => seen, { timeout: 2_000 }).toEqual([]);
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(seen.length).toBeGreaterThan(0);
  await new Promise((resolve) => window.setTimeout(resolve, 100));
  expect(seen.length).toBeGreaterThanOrEqual(1);
  expect(seen.length >= 1).toBe(true);
  const { setTimeout: later, setInterval } = window;
  Reflect.apply(setTimeout, window, [() => undefined, 100]);
  window["setTimeout"](() => undefined, 100);
  const schedule = lookUp(window, "setTimeout");
  Reflect["get"](window, "setInterval");
  (0, lookUp)(window, "setInterval");
  const read = Reflect.get;
  read(window, "setTimeout");
  expect([later, setInterval, schedule]).toHaveLength(3);
});
