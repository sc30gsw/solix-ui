import { createElementValue } from "./internal-browser-value";
import { disposeAll, watchEvents } from "./internal-listener";
import type { BrowserValue, RefSetter } from "./types";

/** The ref to put on the element, and whether the pointer is over it. */
export type HoverReturn<E extends Element> = { ref: RefSetter<E>; hovered: BrowserValue<boolean> };

/**
 * Whether the pointer is over the element its ref is on, and that ref: `mouseenter` makes it
 * `true` and `mouseleave` `false`. It is `false` on the server. When its ref receives an element,
 * once the owner's effects run, it reads whether the element matches `:hover`, and when the ref
 * moves to another element it reads that one.
 *
 * ```tsx
 * const { ref, hovered } = createHover();
 * return <button ref={ref}>{hovered() ? "Release to drop" : "Drag"}</button>;
 * ```
 */
export function createHover<E extends Element = Element>(): HoverReturn<E> {
  const [ref, hovered] = createElementValue<E, boolean>(
    false,
    (element) => element.matches(":hover"),
    (element, deliver) =>
      disposeAll([
        watchEvents(element, ["mouseenter"], () => deliver(true)),
        watchEvents(element, ["mouseleave"], () => deliver(false)),
      ]),
  );
  return { ref, hovered };
}
