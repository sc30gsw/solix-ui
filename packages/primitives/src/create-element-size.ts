import { createResizeObserver } from "./create-resize-observer";
import type { BrowserValue, MaybeAccessor, RefSetter } from "./types";

/** The ref to put on the element, and the width and height of its box. */
export type ElementSize<E extends Element> = {
  ref: RefSetter<E>;
  width: BrowserValue<number>;
  height: BrowserValue<number>;
};

/**
 * The width and height of the element's box, as `createResizeObserver` gives them: `0` on the
 * server, until the first report, and where the browser has no `ResizeObserver`, then written at
 * most once per animation frame. `options` is live and compared by value, and `box`, the content
 * box by default, names the box they measure.
 *
 * ```tsx
 * const size = createElementSize();
 * return <div ref={size.ref}>{size.height()}</div>;
 * ```
 */
export function createElementSize<E extends Element = Element>(
  options?: MaybeAccessor<ResizeObserverOptions | undefined>,
): ElementSize<E> {
  const [ref, rect] = createResizeObserver<E>(options);
  return { ref, width: () => rect().width, height: () => rect().height };
}
