import { createIntersection } from "./create-intersection";
import { mapBrowserValue } from "./internal-browser-value";
import type { BrowserValue, RefSetter } from "./types";

/** The ref to put on the element, and whether any of it is in the viewport. */
export type InViewportReturn<E extends Element> = {
  ref: RefSetter<E>;
  inViewport: BrowserValue<boolean>;
};

/**
 * Whether the element its ref is on intersects the viewport, and that ref, as `createIntersection`
 * reports it with its default options. It is `false` on the server, until the observer first
 * reports, where the browser has no `IntersectionObserver`, and when the ref moves to another
 * element, until that one's first report.
 *
 * ```tsx
 * const { ref, inViewport } = createInViewport();
 * return <section ref={ref} data-seen={inViewport()} />;
 * ```
 */
export function createInViewport<E extends Element = Element>(): InViewportReturn<E> {
  const { ref, entry } = createIntersection<E>();
  return { ref, inViewport: mapBrowserValue(entry, (found) => found?.isIntersecting ?? false) };
}
