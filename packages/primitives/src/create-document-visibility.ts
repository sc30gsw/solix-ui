import { lookUp } from "#/src/internal-browser-api.ts";
import { createBrowserValue, readOn } from "#/src/internal-browser-value.ts";
import type { BrowserValue } from "#/src/types.ts";

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
      (page) => lookUp(page, "visibilityState") ?? "visible",
    ),
    { loadingValue: "visible" },
  );
}
