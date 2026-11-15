import { expect, test } from "vite-plus/test";
import "./support/browser-harness";

test("waits by itself", async () => {
  const seen: string[] = [];
  await expect.poll(() => seen, { timeout: 2_000 }).toEqual([]);
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(seen.length).toBeGreaterThan(0);
  await new Promise((resolve) => window.setTimeout(resolve, 100));
  expect(seen.length).toBeGreaterThanOrEqual(1);
  expect(seen.length >= 1).toBe(true);
});
