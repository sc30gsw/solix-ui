import { browserMethod } from "#/src/internal-browser-api.ts";
import { createBrowserValue, readOn } from "#/src/internal-browser-value.ts";
import type { BrowserValue } from "#/src/types.ts";

/**
 * The document's selection, `document.getSelection()`, read again on every `selectionchange`.
 * The browser keeps one `Selection` object and changes it in place, so every change is reported,
 * even though the object is the same. Its loading value is `null`, and so is its value where the
 * document has no `getSelection`.
 *
 * ```tsx
 * const selection = createTextSelection();
 * return <p>Selected: {selection()?.toString()}</p>;
 * ```
 */
export function createTextSelection(): BrowserValue<Selection | null> {
  return createBrowserValue(
    readOn(
      () => document,
      ["selectionchange"],
      (page) => browserMethod(page, "getSelection")?.() ?? null,
    ),
    { loadingValue: null, equals: false },
  );
}
