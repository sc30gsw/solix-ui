import { createEffect } from "solid-js";
import { access } from "./internal-access";
import { createScrollFold, type ScrollMove } from "./internal-scroll";
import type { BrowserValue, MaybeAccessor } from "./types";

/** Where the element is fixed, how far a scroll reveals or hides it, and what to call. */
export type HeadroomOptions = {
  /** The scroll position, in pixels, at or above which the element is fixed. Default `0`. */
  fixedAt?: MaybeAccessor<number>;
  /**
   * How many pixels of scrolling reveal or hide the element fully. Default `100`. At `0` or below,
   * any scroll past `fixedAt` reveals or hides it fully.
   */
  scrollDistance?: MaybeAccessor<number>;
  /** Called when scrolling up, or entering the fixed zone, pins the element. */
  onPin?: () => void;
  /** Called when the scroll position enters the fixed zone. */
  onFix?: () => void;
  /** Called when scrolling down outside the fixed zone releases a pinned element. */
  onRelease?: () => void;
};

/** Whether any of the element shows, and how much of it shows. */
export type HeadroomReturn = {
  pinned: BrowserValue<boolean>;
  scrollProgress: BrowserValue<number>;
};

type Setup = { fixedAt: number; distance: number };

type Headroom = { live: boolean; progress: number; fixed: boolean; pinnedByDirection: boolean };

const shownWhileLoading: Headroom = Object.freeze({
  live: false,
  progress: 1,
  fixed: true,
  pinnedByDirection: true,
});

const beforeAnyCallback = Object.freeze({ fixed: false, pinnedByDirection: false });

function withinZeroAndOne(progress: number): number {
  return Math.min(Math.max(progress, 0), 1);
}

function headroomAt(y: number, setup: Setup): Headroom {
  const fixed = y <= setup.fixedAt;
  return { live: true, progress: fixed ? 1 : 0, fixed, pinnedByDirection: fixed };
}

function shownBefore(state: Headroom): number {
  return state.fixed ? 1 : state.progress;
}

function scrolledDown(state: Headroom, move: ScrollMove, setup: Setup): number {
  return state.fixed ? move.to - setup.fixedAt : move.to - move.from;
}

function hiddenBy(scrolled: number, setup: Setup): number {
  return setup.distance > 0 ? scrolled / setup.distance : Math.sign(scrolled);
}

function afterScroll(state: Headroom, move: ScrollMove, setup: Setup): Headroom {
  const fixed = move.to <= setup.fixedAt;
  const hidden = hiddenBy(scrolledDown(state, move, setup), setup);
  return {
    live: true,
    progress: fixed ? 1 : withinZeroAndOne(shownBefore(state) - hidden),
    fixed,
    pinnedByDirection: fixed || move.to < move.from,
  };
}

/**
 * The state of a header that hides as the page scrolls down and comes back as it scrolls up.
 *
 * `scrollProgress` is how much of the element shows, from `1`, all of it, to `0`, none. At or
 * above `fixedAt` it is `1`. Past it, each scroll down lowers it, and each scroll up raises it, by
 * the distance scrolled divided by `scrollDistance`, within `0` and `1`, so with the defaults a
 * scroll from the top to 50 shows half and one to 100 none, and a scroll back up shows it again
 * from where it was. A page already scrolled past `fixedAt` when it goes live starts at `0`.
 * `pinned` is whether `scrollProgress` is above `0`. Their loading values are `true` and `1`.
 * Scroll positions, and the scrolls ignored while a resize settles, are read as
 * `createScrollDirection` reads them.
 *
 * `onPin` and `onRelease` follow the direction rather than `scrollProgress`: entering the fixed
 * zone, or scrolling up outside it, calls `onPin`, and scrolling down outside it calls
 * `onRelease`, each once until the other, and never while the scroll goes the other way. `onFix`
 * is called when the position enters the fixed zone. When the page goes live in the fixed zone,
 * `onPin` and `onFix` are called; one that hydrates calls them for the live position only. They
 * run after Solid applies the change, and each is read when it is called. A change of `fixedAt` or
 * `scrollDistance` to a different value starts over from the current position, as a page that
 * goes live there does.
 *
 * ```tsx
 * const headroom = createHeadroom({ fixedAt: 120 });
 * return <header style={{ translate: `0 ${(headroom.scrollProgress() - 1) * 100}%` }} />;
 * ```
 */
export function createHeadroom(options?: HeadroomOptions): HeadroomReturn {
  const state = createScrollFold<Headroom, Setup>(headroomAt, afterScroll, {
    loadingValue: shownWhileLoading,
    config: () => ({
      fixedAt: access(options?.fixedAt ?? 0),
      distance: access(options?.scrollDistance ?? 100),
    }),
  });
  createEffect(
    () => {
      const current = state();
      return current.live ? current : undefined;
    },
    (current, previous) => {
      if (current === undefined) return;
      const before = previous ?? beforeAnyCallback;
      if (current.pinnedByDirection && !before.pinnedByDirection) options?.onPin?.();
      if (!current.pinnedByDirection && before.pinnedByDirection) options?.onRelease?.();
      if (current.fixed && !before.fixed) options?.onFix?.();
    },
  );
  return { pinned: () => state().progress > 0, scrollProgress: () => state().progress };
}
