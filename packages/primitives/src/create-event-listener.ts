import { access } from "./internal-access";
import { createElementSlot } from "./internal-element";
import { createAttachment, listen, listenerSettings, sameSettings } from "./internal-listener";
import type { ListenerOptions, MaybeAccessor, RefSetter } from "./types";

/**
 * Listens to `type` on the element its ref is on. Put the ref on one element: the listener moves
 * to each element the ref receives, and is removed when the owner is disposed. Nothing is added on
 * the server, or before the ref receives an element.
 *
 * `type` and `options` are live. A change of the type, `capture`, `passive`, `once` or `signal`
 * moves the listener, removed with the options it was added with. Options compared by value, such
 * as an accessor that returns a new object each time, keep it in place, with no gap and no
 * duplicate. The listener is the function passed, so read anything that changes inside it.
 *
 * ```tsx
 * const ref = createEventListener("pointerenter", () => setHinted(true));
 * return <button ref={ref}>Save</button>;
 * ```
 */
export function createEventListener<
  K extends keyof HTMLElementEventMap,
  E extends HTMLElement = HTMLElement,
>(
  type: MaybeAccessor<K>,
  listener: (event: HTMLElementEventMap[K]) => void,
  options?: MaybeAccessor<ListenerOptions | undefined>,
): RefSetter<E>;
export function createEventListener<E extends Element = HTMLElement>(
  type: MaybeAccessor<string>,
  listener: (event: Event) => void,
  options?: MaybeAccessor<ListenerOptions | undefined>,
): RefSetter<E>;
export function createEventListener<E extends Element>(
  type: MaybeAccessor<string>,
  listener: (event: Event) => void,
  options?: MaybeAccessor<ListenerOptions | undefined>,
): RefSetter<E> {
  const [element, ref] = createElementSlot<E>();
  createAttachment(
    () => {
      const target = element();
      return target && { target, settings: listenerSettings(access(type), access(options)) };
    },
    (current) => listen(current.target, current.settings, listener),
    (left, right) => left.target === right.target && sameSettings(left.settings, right.settings),
  );
  return ref;
}
