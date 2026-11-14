import { access } from "./internal-access";
import { createElementAttachment } from "./internal-attachment";
import { observe } from "./internal-dom-observer";
import type { MaybeAccessor, RefSetter } from "./types";

/**
 * Calls `callback` with the mutations of the element its ref is on that `options` asks for, and
 * returns that ref. The observer starts once the owner's effects run and the ref has an element,
 * never on the server, moves to each element the ref receives, and is disconnected when the owner
 * is disposed. Where the browser has no `MutationObserver`, nothing is observed.
 *
 * `options` is live and compared by value, `attributeFilter` item by item, so an object written
 * inline keeps the observer; a change builds a new one.
 *
 * ```tsx
 * const ref = createMutationObserver((records) => setCount(records.length), { childList: true });
 * return <ul ref={ref}>...</ul>;
 * ```
 */
export function createMutationObserver<E extends Element = Element>(
  callback: MutationCallback,
  options: MaybeAccessor<MutationObserverInit>,
): RefSetter<E> {
  return createElementAttachment<E, { element: E; init: MutationObserverInit }>(
    (element) => element && { element, init: { ...access(options) } },
    (current) =>
      observe("MutationObserver", current.element, current.init, (records, observer) =>
        callback(records, observer as MutationObserver),
      ),
  );
}
