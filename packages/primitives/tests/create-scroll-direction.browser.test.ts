import fc from "fast-check";
import type { Accessor } from "solid-js";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { createScrollDirection, type ScrollDirection } from "#/src/index.ts";
import { mount, unmount } from "#/tests/support/browser-harness.ts";
import { engineWait } from "#/tests/support/dom.ts";
import {
  applied,
  onScrollGrid,
  type ScrollStub,
  stubbedScroll,
  tallPage,
} from "#/tests/support/scroll.ts";
import { assertProperty } from "../../../tests/support/properties.ts";

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

test("for every generated sequence of scroll positions, it agrees with a model of the last move", async (context) => {
  await assertProperty(
    context,
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
