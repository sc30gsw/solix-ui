import { access } from "./internal-access";
import { createBrowserValue } from "./internal-browser-value";
import type { BrowserValue, MaybeAccessor } from "./types";

export function createWatched(query: MaybeAccessor<string>): { value: BrowserValue<number> } {
  return {
    value: createBrowserValue(
      (deliver, text: string) => deliver(window.matchMedia(text).matches ? 1 : 0),
      { loadingValue: 0, config: () => access(query) },
    ),
  };
}
