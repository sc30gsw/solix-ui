import { lookUp } from "#/src/internal-browser-api.ts";
import { type BrowserCallback, createBrowserValue } from "#/src/internal-browser-value.ts";
import type { LiveConfig } from "#/src/internal-equal.ts";
import { watchEvents } from "#/src/internal-listener.ts";
import type { BrowserValue } from "#/src/types.ts";

export const resizeSettleMs = 300;

export type ScrollMove = { from: number; to: number };

export type ScrollFoldOptions<S> = {
  loadingValue: S;
  onChange?: (current: S, previous: S | undefined) => void;
};

function verticalScroll(): number {
  return lookUp(window, "scrollY") || document.documentElement.scrollTop;
}

export function createScrollFold<S>(
  start: BrowserCallback<[y: number], S>,
  step: BrowserCallback<[state: S, move: ScrollMove], S>,
  options: ScrollFoldOptions<S>,
): BrowserValue<S>;
export function createScrollFold<S, C>(
  start: BrowserCallback<[y: number, config: C], S>,
  step: BrowserCallback<[state: S, move: ScrollMove, config: C], S>,
  options: ScrollFoldOptions<S> & { config: LiveConfig<C> },
): BrowserValue<S>;
export function createScrollFold<S, C>(
  start: BrowserCallback<[y: number, config: C | undefined], S>,
  step: BrowserCallback<[state: S, move: ScrollMove, config: C | undefined], S>,
  options: ScrollFoldOptions<S> & { config?: LiveConfig<C> },
): BrowserValue<S> {
  return createBrowserValue<S, C | undefined>(
    (deliver, keep, config) => {
      const fold: { y: number; state: S; settling: ReturnType<typeof setTimeout> | undefined } = {
        y: verticalScroll(),
        state: start(verticalScroll(), config),
        settling: undefined,
      };
      deliver(fold.state);
      keep(
        watchEvents(
          window,
          ["scroll"],
          () => {
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
          ["resize"],
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
    },
    {
      loadingValue: options.loadingValue,
      config: () => options.config?.(),
      onChange: (current, previous) => options.onChange?.(current, previous),
    },
  );
}
