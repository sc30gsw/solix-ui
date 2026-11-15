import { lookUp } from "./internal-browser-api";
import { createBrowserValue } from "./internal-browser-value";
import { watchEvents } from "./internal-listener";
import type { BrowserValue } from "./types";

export const resizeSettleMs = 300;

export type ScrollMove = { from: number; to: number };

export type ScrollFoldOptions<S, C> = { loadingValue: S; config?: () => C };

function verticalScroll(): number {
  return lookUp(window, "scrollY") || document.documentElement.scrollTop;
}

export function createScrollFold<S, C = undefined>(
  start: (y: number, config: C) => S,
  step: (state: S, move: ScrollMove, config: C) => S,
  options: ScrollFoldOptions<S, C>,
): BrowserValue<S> {
  return createBrowserValue<S, C>((deliver, keep, config) => {
    const fold: { y: number; state: S; settling: ReturnType<typeof setTimeout> | undefined } = {
      y: verticalScroll(),
      state: start(verticalScroll(), config),
      settling: undefined,
    };
    deliver(fold.state);
    keep(
      watchEvents(
        window,
        "scroll",
        (event) => {
          if (event.target !== document && event.target !== window) return;
          if (fold.settling !== undefined) return;
          const to = verticalScroll();
          if (to === fold.y) return;
          fold.state = step(fold.state, { from: fold.y, to }, config);
          fold.y = to;
          deliver(fold.state);
        },
        { passive: true },
      ),
    );
    keep(
      watchEvents(
        window,
        "resize",
        () => {
          clearTimeout(fold.settling);
          fold.settling = setTimeout(() => {
            fold.settling = undefined;
            fold.y = verticalScroll();
          }, resizeSettleMs);
        },
        { passive: true },
      ),
    );
    keep(() => clearTimeout(fold.settling));
  }, options);
}
