import { afterEach, expect, test, vi } from "vite-plus/test";
import { createScrollFold, resizeSettleMs, type ScrollMove } from "#/src/internal-scroll.ts";
import { mount, unmount } from "#/tests/support/browser-harness.ts";
import { engineWait } from "#/tests/support/dom.ts";
import {
  applied,
  stubbedScroll,
  stylesheetArrivesAndShortens,
  tallPage,
} from "#/tests/support/scroll.ts";

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

test("scrolls are ignored from a resize until it settles, one just before that is still ignored, and the position is then read again, so the next move starts there", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const scroll = stubbedScroll(0);
  const seen = moves();

  scroll.resize();
  vi.advanceTimersByTime(resizeSettleMs - 1);
  scroll.to(600);
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

test("a stylesheet that arrives after the fold goes live and shortens the page moves the window's position, and the fold steps to where it went", async () => {
  const page = tallPage();
  window.scrollTo({ top: 3000, behavior: "instant" });
  const seen = moves();

  stylesheetArrivesAndShortens(page);
  await expect.poll(seen, engineWait).toEqual([{ from: 3000, to: 0 }]);
  expect(window.scrollY).toBe(0);
});
