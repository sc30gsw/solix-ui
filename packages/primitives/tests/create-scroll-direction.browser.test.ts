import fc from "fast-check";
import type { Accessor } from "solid-js";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { createScrollDirection, type ScrollDirection } from "../src/index";
import { resizeSettleMs } from "../src/internal-scroll";
import { mount, unmount } from "./support/browser-harness";
import { engineWait } from "./support/dom";
import { applied, onScrollGrid, type ScrollStub, stubbedScroll, tallPage } from "./support/scroll";

afterEach(() => {
  vi.useRealTimers();
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
});

test("it is unknown until the first scroll, then down for a larger position and up for a smaller one, and a scroll that leaves the position where it was changes nothing", async () => {
  const scroll = stubbedScroll(100);
  const direction = mount(() => createScrollDirection());
  const seen: ScrollDirection[] = [direction()];

  for (const y of [150, 150, 120, 120, 200]) {
    scroll.to(y);
    await applied();
    seen.push(direction());
  }
  expect(seen).toEqual(["unknown", "down", "down", "up", "up", "down"]);
});

test("it follows the window as it really scrolls", async () => {
  tallPage();
  const direction = mount(() => createScrollDirection());

  window.scrollTo({ top: 300, behavior: "instant" });
  await expect.poll(direction, engineWait).toBe("down");
  window.scrollTo({ top: 100, behavior: "instant" });
  await expect.poll(direction, engineWait).toBe("up");
});

test("a layout shift while a resize settles is not taken for a scroll: the next scroll after it is compared with the position read when it settled", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const scroll = stubbedScroll(1000);
  const direction = mount(() => createScrollDirection());

  scroll.resize();
  scroll.to(600);
  vi.advanceTimersByTime(resizeSettleMs);
  scroll.to(620);
  vi.useRealTimers();
  await applied();
  expect(direction()).toBe("down");
});

test("disposing the owner while a resize settles clears the timer", async () => {
  const scroll = stubbedScroll(0);
  mount(() => createScrollDirection());

  scroll.resize();
  unmount();
  scroll.to(10);
  await applied();
});

type Model = { y: number; direction: ScrollDirection };
type Real = { direction: Accessor<ScrollDirection>; scroll: ScrollStub };

function scrollTo(y: number): fc.AsyncCommand<Model, Real> {
  return {
    check: () => true,
    run: async (model, real) => {
      real.scroll.to(y);
      await applied();
      if (y !== model.y) model.direction = y < model.y ? "up" : "down";
      model.y = y;
      expect(real.direction(), `the direction after a scroll to ${y}`).toBe(model.direction);
    },
    toString: () => `scroll to ${y}`,
  };
}

test("for every generated sequence of scroll positions, it agrees with a model of the last move", async () => {
  await fc.assert(
    fc.asyncProperty(
      onScrollGrid(12),
      fc.commands([onScrollGrid(12).map(scrollTo)], { maxCommands: 25, size: "medium" }),
      async (start, sequence) => {
        const scroll = stubbedScroll(start);
        try {
          const direction = mount(() => createScrollDirection());
          const model: Model = { y: start, direction: "unknown" };
          expect(direction()).toBe(model.direction);
          await fc.asyncModelRun(() => ({ model, real: { direction, scroll } }), sequence);
        } finally {
          unmount();
          scroll.restore();
        }
      },
    ),
  );
});
