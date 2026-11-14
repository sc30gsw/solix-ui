import { access } from "./internal-access";
import { createElementValue } from "./internal-attachment";
import { observe } from "./internal-dom-observer";
import type { BrowserValue, MaybeAccessor, RefSetter } from "./types";

/** The ref to put on the element, and the latest entry the observer reported for it. */
export type IntersectionReturn<E extends Element> = {
  ref: RefSetter<E>;
  entry: BrowserValue<IntersectionObserverEntry | null>;
};

/**
 * Watches how the element its ref is on intersects its root, the viewport unless `options` names
 * one, and returns that ref and the latest entry, the last of each batch the observer reports.
 *
 * The entry is `null` on the server, until the observer first reports, once the owner's effects
 * run and the ref has an element, and where the browser has no `IntersectionObserver`. It goes
 * back to `null` when the ref moves to another element, until that one's first entry. `options`
 * is live and compared by value, `threshold` item by item, so an array written inline keeps the
 * observer; a change of `root`, `rootMargin` or `threshold` builds a new one.
 *
 * ```tsx
 * const { ref, entry } = createIntersection({ threshold: [0, 1] });
 * return <img ref={ref} src={entry()?.isIntersecting ? props.src : undefined} />;
 * ```
 */
export function createIntersection<E extends Element = Element>(
  options?: MaybeAccessor<IntersectionObserverInit | undefined>,
): IntersectionReturn<E> {
  const [ref, entry] = createElementValue<
    E,
    IntersectionObserverEntry | null,
    IntersectionObserverInit
  >(
    null,
    (element, init, deliver) =>
      observe("IntersectionObserver", element, init, (entries) => {
        const last = entries.at(-1);
        if (last) deliver(last);
      }),
    () => ({ ...access(options) }),
  );
  return { ref, entry };
}
