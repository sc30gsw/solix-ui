import { createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { createMediaQuery } from "../src/index";
import { flush, mount, record, unmount } from "./support/browser-harness";
import { engineWait, witnessed } from "./support/dom";
import { replaced } from "./support/replace";

const viewport = { width: 414, height: 896 };

afterEach(async () => {
  await page.viewport(viewport.width, viewport.height);
});

function controlFor(query: string): () => boolean {
  const changes = record(window.matchMedia(query), "change");
  return () => changes.length > 0;
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

test("a query that recomputes to the same text keeps its listener and reads nothing again", () => {
  const [width, setWidth] = createSignal(600.2);
  const matchMedia = vi.spyOn(window, "matchMedia");
  mount(() => createMediaQuery(() => `(min-width: ${Math.round(width())}px)`));
  const before = matchMedia.mock.calls.length;

  setWidth(599.8);
  flush();
  expect(matchMedia.mock.calls.length).toBe(before);
  matchMedia.mockRestore();
});

test("without matchMedia it gives the initial value, or false, and throws nothing", () => {
  const restore = replaced(window, "matchMedia", undefined);
  try {
    const withInitial = mount(() => createMediaQuery("(min-width: 1px)", true));
    const withoutInitial = mount(() => createMediaQuery("(min-width: 1px)"));

    expect([withInitial(), withoutInitial()]).toEqual([true, false]);
  } finally {
    restore();
  }
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
  const changed = controlFor("(min-width: 600px)");

  unmount();
  await page.viewport(400, 600);
  await witnessed(changed, "the media query change");
  expect(wide()).toBe(true);
});
