import { createIntersection } from "#/src/create-intersection.ts";
import { mapBrowserValue } from "#/src/internal-browser-value.ts";
import type { BrowserValue, RefSetter } from "#/src/types.ts";

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
