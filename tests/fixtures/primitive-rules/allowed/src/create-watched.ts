import { access } from "#/packages/primitives/src/internal-access.ts";
import { createBrowserValue } from "#/packages/primitives/src/internal-browser-value.ts";
import { lookUp } from "#/packages/primitives/src/internal-browser-api.ts";
import { observe } from "#/packages/primitives/src/internal-dom-observer.ts";
import { watchEvents } from "#/packages/primitives/src/internal-listener.ts";
import type { BrowserValue, MaybeAccessor } from "#/packages/primitives/src/types.ts";

function matches(text: string): number {
  const { scrollY } = window;
  const focused = document["activeElement"];
  const spread: [HTMLElement, "focus"] = [document.body, "focus"];
  void [Reflect.get(...spread), lookUp(...spread)];
  return lookUp(window, "matchMedia")?.call(window, text).matches && focused ? scrollY : 0;
}

/** Holds what the rules allow. */
export function createWatched(query: MaybeAccessor<string>): { value: BrowserValue<number> } {
  return {
    value: createBrowserValue(
      (deliver, keep, text: string) => {
        keep(watchEvents(window, ["scroll"], () => deliver(matches(text))));
        keep(
          observe("MutationObserver", document.body, { childList: true }, () =>
            deliver(matches(text)),
          ),
        );
      },
      { loadingValue: 0, config: () => access(query) },
    ),
  };
}
