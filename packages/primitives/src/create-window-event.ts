import { access } from "#/src/internal-access.ts";
import { createAttachment } from "#/src/internal-attachment.ts";
import { type EventOf, listenAsAsked, listenerSettings } from "#/src/internal-listener.ts";
import type { ListenerOptions, MaybeAccessor } from "#/src/types.ts";

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
    (settings) => listenAsAsked<Window, K>(window, settings, listener),
    () => listenerSettings(access(type), access(options)),
  );
}
