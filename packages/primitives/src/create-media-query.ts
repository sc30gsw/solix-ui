import { access, accessUntracked } from "./internal-access";
import { browserMethod } from "./internal-browser-api";
import { createBrowserValue, readOn } from "./internal-browser-value";
import type { BrowserValue, MaybeAccessor, ReadOnce } from "./types";

/**
 * Whether the media query `query` matches, followed through the query list's `change` event. A
 * change of `query` to a different text reads the new query and moves the listener to it.
 *
 * Its loading value is `initialValue`, read once, or `false`, and it stays so where the browser
 * has no `matchMedia`.
 *
 * ```ts
 * const wide = createMediaQuery("(min-width: 48em)");
 * ```
 */
export function createMediaQuery(
  query: MaybeAccessor<string>,
  initialValue?: ReadOnce<boolean>,
): BrowserValue<boolean> {
  return createBrowserValue(
    readOn(
      (text: string) => browserMethod(window, "matchMedia")?.(text),
      ["change"],
      (list) => list.matches,
    ),
    { loadingValue: accessUntracked(initialValue) ?? false, config: () => access(query) },
  );
}
