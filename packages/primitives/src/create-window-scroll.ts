import { browserApi } from "./internal-browser-api";
import { createBrowserValue, readOn } from "./internal-browser-value";
import { createCommand } from "./internal-command";
import type { BrowserValue } from "./types";

/** A scroll position of the window, in CSS pixels. */
export type ScrollPosition = { x: number; y: number };

/** The window's scroll position, and `scrollTo`, which scrolls it smoothly. */
export type WindowScrollReturn = [
  position: BrowserValue<ScrollPosition>,
  scrollTo: (position: Partial<ScrollPosition>) => void,
];

/**
 * The window's scroll position, `scrollX` and `scrollY`, read again on every `scroll` and
 * `resize` of the window, and `scrollTo`. Its loading value is `{ x: 0, y: 0 }`, and an axis the
 * browser leaves out reads `0`. A position equal by value to the one before changes nothing.
 *
 * `scrollTo` scrolls the window smoothly to the axes it is given as numbers, and leaves the other
 * where it is. It does nothing before the owner's effects run, so never during the server render,
 * and nothing once the owner is disposed.
 *
 * ```tsx
 * const [position, scrollTo] = createWindowScroll();
 * return <button onClick={() => scrollTo({ y: 0 })}>Back to top from {position().y}</button>;
 * ```
 */
export function createWindowScroll(): WindowScrollReturn {
  const position = createBrowserValue(
    readOn(
      () => window,
      ["scroll", "resize"],
      (view) => ({ x: browserApi(view, "scrollX") ?? 0, y: browserApi(view, "scrollY") ?? 0 }),
      { passive: true },
    ),
    { loadingValue: { x: 0, y: 0 } },
  );
  const scrollTo = createCommand(
    (target: Partial<ScrollPosition>) => {
      const options: ScrollToOptions = { behavior: "smooth" };
      if (typeof target.x === "number") options.left = target.x;
      if (typeof target.y === "number") options.top = target.y;
      window.scrollTo(options);
    },
    () => undefined,
  );
  return [position, scrollTo];
}
