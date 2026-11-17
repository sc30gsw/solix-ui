import { createScrollFold } from "#/src/internal-scroll.ts";
import type { BrowserValue } from "#/src/types.ts";

/** Which way the window last scrolled, or `"unknown"` before it has. */
export type ScrollDirection = "up" | "down" | "unknown";

/**
 * Which way the window last scrolled. Each `scroll` event compares the vertical position,
 * `scrollY` or else the document element's `scrollTop`, with the one before: smaller is `"up"`,
 * larger is `"down"`, and an unchanged one, as a horizontal scroll leaves it, changes nothing.
 *
 * Scroll events are ignored from a window `resize` until resizing has settled, and then the
 * position is read again, so a layout shift is not taken for a scroll. Its loading value is
 * `"unknown"`, and it stays so until the first scroll.
 *
 * ```ts
 * const direction = createScrollDirection();
 * ```
 */
export function createScrollDirection(): BrowserValue<ScrollDirection> {
  return createScrollFold<ScrollDirection>(
    () => "unknown",
    (_direction, move) => (move.to < move.from ? "up" : "down"),
    { loadingValue: "unknown" },
  );
}
