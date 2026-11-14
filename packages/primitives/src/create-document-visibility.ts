import { browserApi } from "./internal-browser-api";
import { createBrowserValue, readOn } from "./internal-browser-value";
import type { BrowserValue } from "./types";

/**
 * Whether the document is visible, `document.visibilityState`, read again on every
 * `visibilitychange`. Its loading value is `"visible"`, and so is its value where the document
 * leaves `visibilityState` out.
 *
 * ```ts
 * const visibility = createDocumentVisibility();
 * createEffect(visibility, (state) => state === "hidden" && pausePlayback());
 * ```
 */
export function createDocumentVisibility(): BrowserValue<DocumentVisibilityState> {
  return createBrowserValue<DocumentVisibilityState>(
    readOn(
      () => document,
      ["visibilitychange"],
      (page) => browserApi(page, "visibilityState") ?? "visible",
    ),
    { loadingValue: "visible" },
  );
}
