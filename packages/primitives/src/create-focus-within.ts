import { createElementValue } from "#/src/internal-browser-value.ts";
import { observe } from "#/src/internal-dom-observer.ts";
import { disposeAll, watchEvents } from "#/src/internal-listener.ts";
import { isNode, isShadowRoot } from "#/src/internal-node.ts";
import type { BrowserValue, RefSetter } from "#/src/types.ts";

/**
 * What to call when focus enters the element or leaves it. Each is read when it is called.
 * `onBlur` gets the browser's `focusout` event where it sent one, and `undefined` where the
 * element lost focus without one, as when the focused element is removed in some browsers.
 */
export type FocusWithinOptions = {
  onFocus?: (event: FocusEvent) => void;
  onBlur?: (event: FocusEvent | undefined) => void;
};

/** The ref to put on the element, and whether focus is inside it. */
export type FocusWithinReturn<E extends Element> = {
  ref: RefSetter<E>;
  focused: BrowserValue<boolean>;
};

function holdsFocus(element: Element): boolean {
  return element.isConnected && element.matches(":focus-within");
}

function removalRoots(element: Element): Node[] {
  const root = element.getRootNode();
  return isShadowRoot(root) ? [element.ownerDocument, root] : [element.ownerDocument];
}

/**
 * Whether focus is on the element its ref is on or inside it, and that ref. A `focusin` from
 * outside makes it `true` and calls `onFocus`; focus that moves between elements inside calls
 * nothing. Focus that leaves, to a node outside or to nothing, makes it `false` and calls `onBlur`
 * once, and so does removing the focused element, or the element the ref is on, in every browser.
 * A `focusout` that names the element taking focus is decided at once: nothing is called when
 * that element is inside, and `onBlur` is called before the code that moved focus returns when it
 * is outside. A `focusout` that names none, and a removal, are decided in a microtask after the
 * code that caused them, by `:focus-within`, so removing the focused element and focusing another
 * inside before that code returns calls nothing. Both events are read in the capture phase, so a
 * widget inside that stops them hides nothing.
 *
 * It is `false` on the server. When its ref receives an element, once the owner's effects run, it
 * reads whether focus is already inside, and calls nothing.
 *
 * ```tsx
 * const { ref, focused } = createFocusWithin({ onBlur: () => props.onCommit() });
 * return <fieldset ref={ref} data-focused={focused()}>...</fieldset>;
 * ```
 */
export function createFocusWithin<E extends Element = Element>(
  options?: FocusWithinOptions,
): FocusWithinReturn<E> {
  const [ref, focused] = createElementValue<E, boolean>(false, holdsFocus, (element, deliver) => {
    const state: {
      attached: boolean;
      inside: boolean;
      left: FocusEvent | undefined;
      stopWatching: () => void;
    } = {
      attached: true,
      inside: holdsFocus(element),
      left: undefined,
      stopWatching: () => undefined,
    };
    const leave = () => {
      if (!state.attached || !state.inside) return;
      state.inside = false;
      state.stopWatching();
      deliver(false);
      options?.onBlur?.(state.left);
    };
    const settleAfterLeaving = () => {
      if (!holdsFocus(element)) leave();
    };
    const watchRemovals = () =>
      disposeAll(
        removalRoots(element).map((root) =>
          observe("MutationObserver", root, { childList: true, subtree: true }, settleAfterLeaving),
        ),
      );
    if (state.inside) state.stopWatching = watchRemovals();
    return disposeAll([
      watchEvents<Element, "focusin">(element, ["focusin"], (event) => {
        state.left = undefined;
        if (state.inside) return;
        state.inside = true;
        state.stopWatching = watchRemovals();
        deliver(true);
        options?.onFocus?.(event);
      }),
      watchEvents<Element, "focusout">(element, ["focusout"], (event) => {
        const next = event.relatedTarget;
        if (isNode(next) && element.contains(next)) return;
        state.left = event;
        if (next === null) queueMicrotask(settleAfterLeaving);
        else leave();
      }),
      () => {
        state.attached = false;
        state.stopWatching();
      },
    ]);
  });
  return { ref, focused };
}
