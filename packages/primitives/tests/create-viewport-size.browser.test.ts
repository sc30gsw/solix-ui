import { afterEach, expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { createViewportSize } from "#/src/index.ts";
import { mount } from "#/tests/support/browser-harness.ts";
import { engineWait, nextTask } from "#/tests/support/dom.ts";
import { replaced } from "#/tests/support/replace.ts";

const viewport = { width: 414, height: 896 };

afterEach(async () => {
  await page.viewport(viewport.width, viewport.height);
});

test("it reads the viewport at once, and follows it as it is resized", async () => {
  const size = mount(() => createViewportSize());

  expect([size.width(), size.height()]).toEqual([window.innerWidth, window.innerHeight]);
  await page.viewport(500, 400);
  await expect.poll(() => [size.width(), size.height()], engineWait).toEqual([500, 400]);
});

test("it reads the viewport again on an orientation change", async () => {
  const size = mount(() => createViewportSize());
  const restore = replaced(window, "innerWidth", 321);
  try {
    window.dispatchEvent(new Event("orientationchange"));
    await nextTask();
    expect(size.width()).toBe(321);
  } finally {
    restore();
  }
});

test("a size the browser leaves out reads as 0", () => {
  const restore = replaced(window, "innerHeight", undefined);
  try {
    const size = mount(() => createViewportSize());

    expect(size.height()).toBe(0);
  } finally {
    restore();
  }
});
