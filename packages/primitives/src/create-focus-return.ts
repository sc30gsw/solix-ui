import { type Accessor, createEffect, untrack } from "solid-js";
import { access } from "./internal-access";
import { containsComposed, deepActiveElement } from "./internal-active";
import { createBrowserCommand } from "./internal-command";
import { isFocusTarget, moveFocus } from "./internal-focus";
import type { MaybeAccessor } from "./types";

/** Each option is live. */
export type FocusReturnOptions = {
  /** Remembers the focused element when it turns `true`, and returns focus when it turns `false`. */
  opened: MaybeAccessor<boolean>;
  /** Whether closing returns focus. Default `true`; read when the surface closes. */
  shouldReturnFocus?: MaybeAccessor<boolean>;
  /**
   * The surface's element, such as the setter of a signal given as its ref. Focus still inside it
   * when it closes is returned. Read when the surface closes.
   */
  surface?: Accessor<Element | undefined>;
};

/**
 * Gives focus back to the element that had it before a surface opened, by the rule the platform
 * applies to a popover.
 *
 * Nothing happens when it is created: it follows changes of `opened` only. When `opened` turns
 * `true`, it remembers the focused element. When it turns `false`, once Solid has applied that
 * change, it returns focus to that element, without scrolling, if `shouldReturnFocus` reads `true`
 * and focus is on the body, on nothing, or inside `surface`. Focus the user moved elsewhere stays
 * there: a click on a focusable element outside that closed the surface leaves focus on it. An
 * element that has left the page is not focused, and that is no error.
 *
 * It returns `returnFocus`, which focuses the remembered element at once. It does nothing during
 * the server render, and nothing once the owner is disposed. While the page hydrates it does
 * nothing in a component's body, nor in the first run of an effect created before
 * `createFocusReturn` was called, and it acts from the first run of an effect created after it.
 *
 * ```tsx
 * const [surface, setSurface] = createSignal<HTMLElement>();
 * const returnFocus = createFocusReturn({ opened: () => props.opened, surface });
 * return <div ref={setSurface} role="dialog" aria-label="Filters">...</div>;
 * ```
 */
export function createFocusReturn(options: FocusReturnOptions): () => void {
  const state: { remembered: Element | null } = { remembered: null };
  const returnFocus = createBrowserCommand(
    () => {
      const target = state.remembered;
      if (isFocusTarget(target)) moveFocus(target, { preventScroll: true });
    },
    () => undefined,
  );
  createEffect(
    () => access(options.opened),
    (opened) => {
      const page = document;
      const focused = deepActiveElement(page);
      if (opened) {
        state.remembered = focused;
        return;
      }
      const surface = untrack(() => options.surface?.());
      const unmoved =
        focused === null ||
        focused === page.body ||
        (surface !== undefined && containsComposed(surface, focused));
      if (unmoved && untrack(() => access(options.shouldReturnFocus ?? true))) returnFocus();
    },
    { defer: true },
  );
  return returnFocus;
}
