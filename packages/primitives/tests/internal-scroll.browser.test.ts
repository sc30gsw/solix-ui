import { afterEach, expect, test, vi } from "vite-plus/test";
import { createScrollFold, resizeSettleMs, type ScrollMove } from "../src/internal-scroll";
import { mount, unmount } from "./support/browser-harness";
import { box } from "./support/dom";
import { applied, stubbedScroll } from "./support/scroll";

afterEach(() => {
  vi.useRealTimers();
});

function moves() {
  return mount(() =>
    createScrollFold<ScrollMove[]>(
      () => [],
      (seen, move) => [...seen, move],
      { loadingValue: [] },
    ),
  );
}

test("the fold starts from the position it goes live at, steps on each scroll of the window, and takes a scroll with no vertical move for no move", async () => {
  const scroll = stubbedScroll(10);
  const seen = moves();

  for (const y of [40, 40, 20]) {
    scroll.to(y);
    await applied();
  }
  expect(seen()).toEqual([
    { from: 10, to: 40 },
    { from: 40, to: 20 },
  ]);
});

test("a scroll of an element inside the page is not a scroll of the window", async () => {
  const scroll = stubbedScroll(10);
  const seen = moves();
  const inner = box("scrolled");

  scroll.to(30);
  inner.dispatchEvent(new Event("scroll"));
  await applied();
  expect(seen()).toEqual([{ from: 10, to: 30 }]);
});

test("scrolls are ignored from a resize until it settles, one just before that is still ignored, and the position is then read again, so the next move starts there", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const scroll = stubbedScroll(0);
  const seen = moves();

  scroll.resize();
  vi.advanceTimersByTime(resizeSettleMs - 1);
  scroll.to(600);
  await Promise.resolve();
  vi.advanceTimersByTime(1);
  scroll.to(620);
  vi.useRealTimers();
  await applied();
  expect(seen()).toEqual([{ from: 600, to: 620 }]);
});

test("disposing the owner before a resize settles clears the timer", async () => {
  const scroll = stubbedScroll(0);
  moves();

  scroll.resize();
  unmount();
  scroll.to(10);
  await applied();
});
