import { createElementValue } from "./internal-attachment";
import { lookUp } from "./internal-browser-api";
import { observe } from "./internal-dom-observer";
import { disposeAll, watchEvents } from "./internal-listener";
import { viewOf } from "./internal-node";
import type { BrowserValue, RefSetter } from "./types";

/** What to call when focus enters the element or leaves it. Each is read when it is called. */
export type FocusWithinOptions = {
  onFocus?: (event: FocusEvent) => void;
  onBlur?: (event: FocusEvent) => void;
};

/** The ref to put on the element, and whether focus is inside it. */
export type FocusWithinReturn<E extends Element> = {
  ref: RefSetter<E>;
  focused: BrowserValue<boolean>;
};

function syntheticFocusOut(element: Element): FocusEvent | undefined {
  const FocusEventClass = lookUp(viewOf(element), "FocusEvent");
  return FocusEventClass && new FocusEventClass("focusout", { relatedTarget: null });
}

/**
 * Whether focus is on the element its ref is on or inside it, and that ref. A `focusin` from
 * outside makes it `true` and calls `onFocus`; focus that moves between elements inside calls
 * nothing. A `focusout` to a node outside, or to nothing, makes it `false` and calls `onBlur`, and
 * so does removing the focused element from inside, with a `focusout` event the primitive makes
 * where the browser sends none. A node counts as inside by `contains`, in this page or a frame's.
 * Both events are read in the capture phase, so a widget inside that stops them hides nothing.
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
  const [ref, focused] = createElementValue<E, boolean>(false, (element, _config, deliver) => {
    const inside = { now: element.matches(":focus-within"), stopWatching: (): void => undefined };
    const leave = (event: FocusEvent | undefined) => {
      inside.now = false;
      inside.stopWatching();
      deliver(false);
      if (event) options?.onBlur?.(event);
    };
    const watchRemovals = () =>
      observe("MutationObserver", element, { childList: true, subtree: true }, () => {
        if (inside.now && !element.matches(":focus-within")) leave(syntheticFocusOut(element));
      });
    if (inside.now) inside.stopWatching = watchRemovals();
    deliver(inside.now);
    return disposeAll([
      watchEvents<Element, "focusin">(element, ["focusin"], (event) => {
        if (inside.now) return;
        inside.now = true;
        inside.stopWatching = watchRemovals();
        deliver(true);
        options?.onFocus?.(event);
      }),
      watchEvents<Element, "focusout">(element, ["focusout"], (event) => {
        const next = event.relatedTarget;
        if (!inside.now || (next !== null && element.contains(next as Node))) return;
        leave(event);
      }),
      () => inside.stopWatching(),
    ]);
  });
  return { ref, focused };
}
