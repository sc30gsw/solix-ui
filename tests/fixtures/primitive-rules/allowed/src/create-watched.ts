import { access } from "../../../../../packages/primitives/src/internal-access";
import { createBrowserValue } from "../../../../../packages/primitives/src/internal-browser-value";
import { lookUp } from "../../../../../packages/primitives/src/internal-browser-api";
import { observe } from "../../../../../packages/primitives/src/internal-dom-observer";
import type { BrowserValue, MaybeAccessor } from "../../../../../packages/primitives/src/types";

function matches(text: string): number {
  return lookUp(window, "matchMedia")?.call(window, text).matches ? 1 : 0;
}

export function createWatched(query: MaybeAccessor<string>): { value: BrowserValue<number> } {
  return {
    value: createBrowserValue(
      (deliver, keep, text: string) => {
        deliver(matches(text));
        keep(observe("MutationObserver", document.body, { childList: true }, () => undefined));
      },
      { loadingValue: 0, config: () => access(query) },
    ),
  };
}
