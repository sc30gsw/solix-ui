import { access } from "./internal-access";
import { createAttachment } from "./internal-attachment";
import { sameKeys } from "./internal-equal";
import { type EventOf, listen, listenerSettings } from "./internal-listener";
import type { ListenerOptions, MaybeAccessor } from "./types";

/**
 * Listens to `type` on `window` while its owner lives. The listener is added once the owner's
 * effects run, which never happens on the server, and removed when the owner is disposed.
 *
 * The event is typed by `WindowEventMap`; a name it does not hold gives an `Event`. `type` and
 * `options` are live, as `ListenerOptions` says.
 *
 * ```ts
 * createWindowEvent("keydown", (event) => event.key === "Escape" && props.onClose());
 * ```
 */
export function createWindowEvent<K extends string>(
  type: MaybeAccessor<K>,
  listener: (event: EventOf<Window, K>) => void,
  options?: MaybeAccessor<ListenerOptions | undefined>,
): void {
  createAttachment(
    () => listenerSettings(access(type), access(options)),
    (settings) => listen<Window, K>(window, settings, listener),
    sameKeys,
  );
}
