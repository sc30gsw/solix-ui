import { access } from "./internal-access";
import { createElementAttachment } from "./internal-attachment";
import {
  type EventOf,
  listenAsAsked,
  type ListenerSettings,
  listenerSettings,
} from "./internal-listener";
import type { ListenerOptions, MaybeAccessor, RefSetter } from "./types";

/**
 * Listens to `type` on the element its ref is on, an HTML, SVG or MathML element, and returns that
 * ref. Put the ref on one element: the listener moves to each element the ref receives, and is
 * removed when the owner is disposed. Nothing is added on the server, or before the ref receives
 * an element.
 *
 * The event is typed by the element's event map, `E`, which takes an SVG element's map for an SVG
 * element; a name the map does not hold gives an `Event`. `type` and `options` are live, as
 * `ListenerOptions` says.
 *
 * ```tsx
 * const ref = createEventListener("pointerenter", () => setHinted(true));
 * return <button ref={ref}>Save</button>;
 * ```
 */
export function createEventListener<K extends string, E extends Element = Element>(
  type: MaybeAccessor<K>,
  listener: (event: EventOf<E, K>) => void,
  options?: MaybeAccessor<ListenerOptions | undefined>,
): RefSetter<E> {
  return createElementAttachment<E, ListenerSettings<K>>(
    (element, settings) => listenAsAsked<E, K>(element, settings, listener),
    () => listenerSettings(access(type), access(options)),
  );
}
