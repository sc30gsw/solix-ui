import { afterEach, expect, test, vi } from "vite-plus/test";
import { createWindowScroll } from "#/src/index.ts";
import { mount, unmount, watch } from "#/tests/support/browser-harness.ts";
import { nextTask, engineWait } from "#/tests/support/dom.ts";
import { tallPage } from "#/tests/support/scroll.ts";

afterEach(() => {
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
});

test("it reads the window's scroll position at once, and follows it as the window scrolls", async () => {
  tallPage();
  window.scrollTo({ left: 30, top: 60, behavior: "instant" });
  const [position] = mount(() => createWindowScroll());

  expect(position()).toEqual({ x: 30, y: 60 });
  window.scrollTo({ left: 0, top: 200, behavior: "instant" });
  await expect.poll(position, engineWait).toEqual({ x: 0, y: 200 });
});

test("a resize that leaves the position where it was changes nothing", async () => {
  tallPage();
  const { seen } = mount(() => {
    const [position] = createWindowScroll();
    return { seen: watch(position) };
  });

  window.dispatchEvent(new Event("resize"));
  await nextTask();
  expect(seen).toEqual([{ x: 0, y: 0 }]);
});

test("scrollTo scrolls smoothly to the axes it is given, and leaves the other where it is", async () => {
  tallPage();
  window.scrollTo({ left: 40, top: 0, behavior: "instant" });
  const scrolls = vi.spyOn(window, "scrollTo");
  const [position, scrollTo] = mount(() => createWindowScroll());

  scrollTo({ y: 300 });
  expect(scrolls.mock.calls.at(-1)).toEqual([{ behavior: "smooth", top: 300 }]);
  await expect.poll(position, engineWait).toEqual({ x: 40, y: 300 });
  scrolls.mockRestore();
});

test("once the owner is disposed, scrollTo does nothing", () => {
  const scrolls = vi.spyOn(window, "scrollTo");
  const [, scrollTo] = mount(() => createWindowScroll());

  unmount();
  scrollTo({ x: 10, y: 10 });
  expect(scrolls).not.toHaveBeenCalled();
  scrolls.mockRestore();
});
