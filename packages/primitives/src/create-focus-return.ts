import { createEffect, onCleanup, untrack } from "solid-js";
import { access } from "./internal-access";
import { listen, listenerSettings } from "./internal-listener";
import type { MaybeAccessor } from "./types";

/** Each option is live. */
export type FocusReturnOptions = {
  /** Remembers the focused element when it turns `true`, and returns focus when it turns `false`. */
  opened: MaybeAccessor<boolean>;
  /** Whether closing returns focus. Default `true`; read when the return is due. */
  shouldReturnFocus?: MaybeAccessor<boolean>;
};

const returnDelay = 10;

function focusedIn(page: Document): Element | null {
  const found = { active: page.activeElement };
  while (found.active?.shadowRoot?.activeElement)
    found.active = found.active.shadowRoot.activeElement;
  return found.active;
}
const tab = "Tab";
const keydown = "keydown";

/**
 * Gives focus back to the element that had it before a surface opened.
 *
 * Nothing happens when it is created: it follows changes of `opened` only. When `opened` turns
 * `true`, it remembers the focused element. When it turns `false`, it returns focus to that
 * element 10 ms later, without scrolling, if `shouldReturnFocus` then reads `true` and focus has
 * not moved on: it is on the body, nowhere, or still on the element that had it when the surface
 * closed. A Tab pressed in those 10 ms, a change of `opened` and disposal each cancel the return.
 * An element that has left the page is not focused, and that is no error.
 *
 * It returns `returnFocus`, which focuses the remembered element at once, and does nothing once
 * the owner is disposed.
 *
 * ```ts
 * const returnFocus = createFocusReturn({ opened: () => props.opened });
 * ```
 */
export function createFocusReturn(options: FocusReturnOptions): () => void {
  const state: { remembered: Element | null; live: boolean } = { remembered: null, live: true };
  onCleanup(() => {
    state.live = false;
  });
  const returnFocus = () => {
    const target = state.remembered;
    if (!state.live || !(target instanceof HTMLElement || target instanceof SVGElement)) return;
    target.focus({ preventScroll: true });
  };
  createEffect(
    () => access(options.opened),
    (opened) => {
      const page = document;
      if (opened) {
        state.remembered = focusedIn(page);
        return undefined;
      }
      const focusedAtClose = focusedIn(page);
      const timer = setTimeout(() => {
        stop();
        const now = focusedIn(page);
        const unmoved = now === null || now === page.body || now === focusedAtClose;
        if (unmoved && untrack(() => access(options.shouldReturnFocus ?? true))) returnFocus();
      }, returnDelay);
      const removeListener = listen<KeyboardEvent>(
        page,
        listenerSettings(keydown, false),
        (event) => {
          if (event.key === tab) stop();
        },
      );
      const stop = () => {
        clearTimeout(timer);
        removeListener();
      };
      return stop;
    },
    { defer: true },
  );
  return returnFocus;
}
