import { browserApi } from "./internal-browser-api";
import { createBrowserValue, readOn } from "./internal-browser-value";
import type { BrowserValue } from "./types";

/** The width and height of the window's viewport, in CSS pixels. */
export type ViewportSize = { width: BrowserValue<number>; height: BrowserValue<number> };

/**
 * The width and height of the window's viewport, `innerWidth` and `innerHeight`, read again on
 * every `resize` and `orientationchange` of the window. Each is `0` as its loading value, and
 * where the browser leaves it out.
 *
 * ```tsx
 * const viewport = createViewportSize();
 * return <p>{viewport.width()} by {viewport.height()}</p>;
 * ```
 */
export function createViewportSize(): ViewportSize {
  const size = createBrowserValue(
    readOn(
      () => window,
      ["resize", "orientationchange"],
      (view) => ({
        width: browserApi(view, "innerWidth") ?? 0,
        height: browserApi(view, "innerHeight") ?? 0,
      }),
      { passive: true },
    ),
    { loadingValue: { width: 0, height: 0 } },
  );
  return { width: () => size().width, height: () => size().height };
}
