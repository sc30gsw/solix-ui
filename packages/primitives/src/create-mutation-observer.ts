import { access } from "#/src/internal-access.ts";
import { createElementAttachment } from "#/src/internal-attachment.ts";
import { observe } from "#/src/internal-dom-observer.ts";
import type { MaybeAccessor, RefSetter } from "#/src/types.ts";

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
  return createElementAttachment<E, MutationObserverInit>(
    (element, init) =>
      observe("MutationObserver", element, init, (records, observer) =>
        callback(records, observer as MutationObserver),
      ),
    () => ({ ...access(options) }),
  );
}
