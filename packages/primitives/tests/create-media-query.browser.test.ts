import { createSignal } from "solid-js";
import { afterEach, expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { createMediaQuery } from "../src/index";
import { flush, mount, record, unmount } from "./support/browser-harness";
import { engineWait, witnessed } from "./support/dom";
import { replaced } from "./support/replace";

const viewport = { width: 414, height: 896 };

afterEach(async () => {
  await page.viewport(viewport.width, viewport.height);
});

function changesOf(query: string): Event[] {
  return record(window.matchMedia(query), "change");
}

test("in a page the browser renders alone, it reads whether the query matches at once, whatever the initial value", () => {
  const matching = mount(() => createMediaQuery("(min-width: 1px)", false));
  const missing = mount(() => createMediaQuery("(max-width: 1px)", true));

  expect([matching(), missing()]).toEqual([true, false]);
});

test("it follows the viewport as it changes", async () => {
  const wide = mount(() => createMediaQuery("(min-width: 600px)"));

  await page.viewport(400, 600);
  await expect.poll(wide, engineWait).toBe(false);
  await page.viewport(800, 600);
  await expect.poll(wide, engineWait).toBe(true);
  await page.viewport(400, 600);
  await expect.poll(wide, engineWait).toBe(false);
});

test("a change of the query reads the new query, and the old one is no longer followed", async () => {
  const [query, setQuery] = createSignal("(min-width: 600px)");
  const matches = mount(() => createMediaQuery(query));

  await page.viewport(800, 600);
  await expect.poll(matches, engineWait).toBe(true);
  setQuery("(max-width: 300px)");
  flush();
  expect(matches()).toBe(false);
  await page.viewport(400, 600);
  await page.viewport(250, 600);
  await expect.poll(matches, engineWait).toBe(true);
});

test("when matchMedia refuses with a SecurityError, it gives the initial value and throws nothing", () => {
  const restore = replaced(window, "matchMedia", () => {
    throw new DOMException("blocked", "SecurityError");
  });
  try {
    const matches = mount(() => createMediaQuery("(min-width: 1px)", true));

    expect(matches()).toBe(true);
  } finally {
    restore();
  }
});

test("the initial value is read once", () => {
  const [initial, setInitial] = createSignal(true);
  const restore = replaced(window, "matchMedia", undefined);
  try {
    const matches = mount(() => createMediaQuery("(min-width: 1px)", initial));

    setInitial(false);
    flush();
    expect(matches()).toBe(true);
  } finally {
    restore();
  }
});

test("once the owner is disposed, a change of the viewport is no longer followed", async () => {
  const wide = mount(() => createMediaQuery("(min-width: 600px)"));
  await page.viewport(800, 600);
  await expect.poll(wide, engineWait).toBe(true);
  const changes = changesOf("(min-width: 600px)");

  unmount();
  await page.viewport(400, 600);
  await witnessed(changes, (seen) => seen.length > 0, "the media query change");
  expect(wide()).toBe(true);
});
