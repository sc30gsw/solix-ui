import fc from "fast-check";
import { createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { createHeadroom, type HeadroomOptions, type HeadroomReturn } from "../src/index";
import { flush, mount, unmount } from "./support/browser-harness";
import { applied, onScrollGrid, type ScrollStub, stubbedScroll } from "./support/scroll";

afterEach(() => {
  vi.useRealTimers();
});

async function scrolled(scroll: ScrollStub, positions: number[]): Promise<void> {
  for (const y of positions) {
    scroll.to(y);
    await applied();
  }
}

function headroomWithCalls(options: HeadroomOptions = {}) {
  const calls: string[] = [];
  const headroom = mount(() =>
    createHeadroom({
      onPin: () => calls.push("pin"),
      onFix: () => calls.push("fix"),
      onRelease: () => calls.push("release"),
      ...options,
    }),
  );
  return { headroom, calls };
}

function shown(headroom: HeadroomReturn): [boolean, number] {
  return [headroom.pinned(), headroom.scrollProgress()];
}

test("at the top it shows fully, and inside the fixed zone it stays so", async () => {
  const scroll = stubbedScroll(0);
  const top = mount(() => createHeadroom());
  const zoned = mount(() => createHeadroom({ fixedAt: 100 }));

  expect(shown(top)).toEqual([true, 1]);
  await scrolled(scroll, [50]);
  expect(shown(zoned)).toEqual([true, 1]);
});

test("past fixedAt each scroll down hides it by the distance over scrollDistance, down to 0, and a scroll up shows it again", async () => {
  const scroll = stubbedScroll(0);
  const headroom = mount(() => createHeadroom({ fixedAt: 0, scrollDistance: 100 }));
  const seen: [boolean, number][] = [];

  for (const y of [50, 100, 500, 450, 400, 0]) {
    await scrolled(scroll, [y]);
    seen.push(shown(headroom));
  }
  expect(seen).toEqual([
    [true, 0.5],
    [false, 0],
    [false, 0],
    [true, 0.5],
    [true, 1],
    [true, 1],
  ]);
});

test("leaving the fixed zone counts the distance from fixedAt", async () => {
  const scroll = stubbedScroll(0);
  const headroom = mount(() => createHeadroom({ fixedAt: 100, scrollDistance: 100 }));

  await scrolled(scroll, [40, 175]);
  expect(shown(headroom)).toEqual([true, 0.25]);
});

test("each scroll moves it by its own distance and direction", async () => {
  const scroll = stubbedScroll(0);
  const headroom = mount(() => createHeadroom({ fixedAt: 0, scrollDistance: 100 }));

  await scrolled(scroll, [75, 50]);
  expect(headroom.scrollProgress()).toBe(0.5);
  await scrolled(scroll, [75]);
  expect(headroom.scrollProgress()).toBe(0.25);
});

test("a page already scrolled past fixedAt when it goes live starts hidden", () => {
  stubbedScroll(500);
  const headroom = mount(() => createHeadroom({ fixedAt: 0 }));

  expect(shown(headroom)).toEqual([false, 0]);
});

test("going live in the fixed zone calls onPin and onFix, and one going live past it calls nothing", () => {
  stubbedScroll(50);
  const inside = headroomWithCalls({ fixedAt: 100 });
  const outside = headroomWithCalls({ fixedAt: 10 });

  expect([inside.calls, outside.calls]).toEqual([["pin", "fix"], []]);
});

test("a scroll up outside the fixed zone pins once, a scroll down after it releases once, and a scroll up never releases", async () => {
  const scroll = stubbedScroll(0);
  const { calls } = headroomWithCalls({ fixedAt: 0 });
  calls.length = 0;

  await scrolled(scroll, [100, 75, 50, 25]);
  const afterTurningUp = [...calls];
  calls.length = 0;
  await scrolled(scroll, [100, 150, 200]);
  const released = [...calls];
  calls.length = 0;
  await scrolled(scroll, [150, 100]);
  expect([afterTurningUp, released, calls]).toEqual([["release", "pin"], ["release"], ["pin"]]);
});

test("entering the fixed zone pins and fixes once", async () => {
  const scroll = stubbedScroll(300);
  const { calls } = headroomWithCalls({ fixedAt: 50 });

  await scrolled(scroll, [400, 40, 30]);
  expect(calls).toEqual(["pin", "fix"]);
});

test("each callback is read when it is called, so the latest one runs", async () => {
  const scroll = stubbedScroll(0);
  const seen: string[] = [];
  const options: HeadroomOptions = { onPin: () => seen.push("first") };
  mount(() => createHeadroom(options));

  await scrolled(scroll, [100]);
  options.onPin = () => seen.push("second");
  await scrolled(scroll, [50]);
  expect(seen).toEqual(["first", "second"]);
});

test("a change of fixedAt starts over from the current position", async () => {
  const scroll = stubbedScroll(0);
  const [fixedAt, setFixedAt] = createSignal(0);
  const headroom = mount(() => createHeadroom({ fixedAt }));
  await scrolled(scroll, [50]);
  expect(headroom.scrollProgress()).toBe(0.5);

  setFixedAt(60);
  flush();
  expect(shown(headroom)).toEqual([true, 1]);
  setFixedAt(20);
  flush();
  expect(shown(headroom)).toEqual([false, 0]);
});

test("at a scroll distance of 0 or below, any scroll past fixedAt hides or reveals it fully", async () => {
  const scroll = stubbedScroll(0);
  const zero = mount(() => createHeadroom({ fixedAt: 0, scrollDistance: 0 }));
  const below = mount(() => createHeadroom({ fixedAt: 0, scrollDistance: -50 }));
  const seen: number[][] = [];

  for (const y of [50, 40, 60]) {
    await scrolled(scroll, [y]);
    seen.push([zero.scrollProgress(), below.scrollProgress()]);
  }
  expect(seen).toEqual([
    [0, 0],
    [1, 1],
    [0, 0],
  ]);
});

test("a scroll that leaves the vertical position where it was is no move: it changes nothing and calls nothing", async () => {
  const scroll = stubbedScroll(0);
  const { headroom, calls } = headroomWithCalls({ fixedAt: 0 });
  await scrolled(scroll, [300, 250]);
  calls.length = 0;

  await scrolled(scroll, [250]);
  expect([calls, shown(headroom)]).toEqual([[], [true, 0.5]]);
});

type Setup = { fixedAt: number; distance: number; start: number };
type State = { y: number; progress: number; fixed: boolean; pinnedByDirection: boolean };
type Model = { setup: Setup; state: State; calls: string[] };
type Real = { headroom: HeadroomReturn; calls: string[]; scroll: ScrollStub };

const beforeAnyCallback: State = { y: 0, progress: 0, fixed: false, pinnedByDirection: false };

function callsBetween(before: State, after: State): string[] {
  return [
    ...(after.pinnedByDirection && !before.pinnedByDirection ? ["pin"] : []),
    ...(!after.pinnedByDirection && before.pinnedByDirection ? ["release"] : []),
    ...(after.fixed && !before.fixed ? ["fix"] : []),
  ];
}

function liveAt(setup: Setup): State {
  const fixed = setup.start <= setup.fixedAt;
  return { y: setup.start, progress: fixed ? 1 : 0, fixed, pinnedByDirection: fixed };
}

function movedTo(model: Model, y: number): State {
  const { fixedAt, distance } = model.setup;
  const from = model.state;
  if (y === from.y) return from;
  const fixed = y <= fixedAt;
  const shownBefore = from.fixed ? 1 : from.progress;
  const scrolledDown = from.fixed ? y - fixedAt : y - from.y;
  const hidden = distance > 0 ? scrolledDown / distance : Math.sign(scrolledDown);
  const progress = fixed ? 1 : Math.min(1, Math.max(0, shownBefore - hidden));
  return { y, progress, fixed, pinnedByDirection: fixed || y < from.y };
}

function expectAgreement(model: Model, real: Real, step: string): void {
  expect(real.headroom.scrollProgress(), `the progress after ${step}`).toBeCloseTo(
    model.state.progress,
    9,
  );
  expect(real.headroom.pinned(), `pinned after ${step}`).toBe(model.state.progress > 0);
  expect(real.calls, `the callbacks after ${step}`).toEqual(model.calls);
}

function scrollTo(y: number): fc.AsyncCommand<Model, Real> {
  return {
    check: () => true,
    run: async (model, real) => {
      real.scroll.to(y);
      await applied();
      const next = movedTo(model, y);
      model.calls.push(...callsBetween(model.state, next));
      model.state = next;
      expectAgreement(model, real, `a scroll to ${y}`);
    },
    toString: () => `scroll to ${y}`,
  };
}

const setups = fc.record({
  fixedAt: onScrollGrid(6),
  distance: fc.constantFrom(-50, 0, 25, 50, 100, 150),
  start: onScrollGrid(16),
});

test("for every generated sequence of scroll positions, its progress, pinned state and callbacks agree with a model of the header", async () => {
  await fc.assert(
    fc.asyncProperty(
      setups,
      fc.commands([onScrollGrid(16).map(scrollTo)], { maxCommands: 25, size: "medium" }),
      async (setup, sequence) => {
        const scroll = stubbedScroll(setup.start);
        try {
          const calls: string[] = [];
          const headroom = mount(() =>
            createHeadroom({
              fixedAt: setup.fixedAt,
              scrollDistance: setup.distance,
              onPin: () => calls.push("pin"),
              onFix: () => calls.push("fix"),
              onRelease: () => calls.push("release"),
            }),
          );
          const state = liveAt(setup);
          const model: Model = { setup, state, calls: callsBetween(beforeAnyCallback, state) };
          expectAgreement(model, { headroom, calls, scroll }, `going live at ${setup.start}`);
          await fc.asyncModelRun(() => ({ model, real: { headroom, calls, scroll } }), sequence);
        } finally {
          unmount();
          scroll.restore();
        }
      },
    ),
  );
});

test("for every generated sequence of scroll positions, the documented rules hold: progress stays between 0 and 1, it is 1 in the fixed zone, a scroll down never raises it and a scroll up never lowers it, and a scroll with no vertical move changes nothing and calls nothing", async () => {
  await fc.assert(
    fc.asyncProperty(
      setups,
      fc.array(onScrollGrid(16), { maxLength: 25 }),
      async (setup, positions) => {
        const scroll = stubbedScroll(setup.start);
        try {
          const calls: string[] = [];
          const headroom = mount(() =>
            createHeadroom({
              fixedAt: setup.fixedAt,
              scrollDistance: setup.distance,
              onPin: () => calls.push("pin"),
              onFix: () => calls.push("fix"),
              onRelease: () => calls.push("release"),
            }),
          );
          const at = { y: setup.start };
          for (const y of positions) {
            const before = { progress: headroom.scrollProgress(), calls: calls.length };
            scroll.to(y);
            await applied();
            const progress = headroom.scrollProgress();
            const step = `a scroll from ${at.y} to ${y}`;
            expect(progress >= 0 && progress <= 1, `progress within 0 and 1 after ${step}`).toBe(
              true,
            );
            expect(headroom.pinned(), `pinned after ${step}`).toBe(progress > 0);
            expect(
              y > setup.fixedAt || progress === 1,
              `fully shown in the fixed zone after ${step}`,
            ).toBe(true);
            expect(y <= at.y || progress <= before.progress, `not raised by ${step}`).toBe(true);
            expect(y >= at.y || progress >= before.progress, `not lowered by ${step}`).toBe(true);
            expect(
              y !== at.y || (progress === before.progress && calls.length === before.calls),
              `nothing changed or called by ${step}`,
            ).toBe(true);
            at.y = y;
          }
        } finally {
          unmount();
          scroll.restore();
        }
      },
    ),
  );
});
