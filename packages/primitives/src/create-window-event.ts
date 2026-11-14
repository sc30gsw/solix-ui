import { access } from "./internal-access";
import { createAttachment, listen, listenerSettings, sameSettings } from "./internal-listener";
import type { ListenerOptions, MaybeAccessor } from "./types";

/**
 * Listens to `type` on `window` while its owner lives. The listener is added once the owner's
 * effects run, which never happens on the server, and removed when the owner is disposed.
 *
 * `type` and `options` are live. A change of the type, `capture`, `passive`, `once` or `signal`
 * moves the listener, removed with the options it was added with. Options compared by value, such
 * as an accessor that returns a new object each time, keep it in place. The listener is the
 * function passed, so read anything that changes inside it.
 *
 * ```ts
 * createWindowEvent("keydown", (event) => event.key === "Escape" && props.onClose());
 * ```
 */
export function createWindowEvent<K extends keyof WindowEventMap>(
  type: MaybeAccessor<K>,
  listener: (event: WindowEventMap[K]) => void,
  options?: MaybeAccessor<ListenerOptions | undefined>,
): void;
export function createWindowEvent(
  type: MaybeAccessor<string>,
  listener: (event: Event) => void,
  options?: MaybeAccessor<ListenerOptions | undefined>,
): void;
export function createWindowEvent(
  type: MaybeAccessor<string>,
  listener: (event: Event) => void,
  options?: MaybeAccessor<ListenerOptions | undefined>,
): void {
  createAttachment(
    () => listenerSettings(access(type), access(options)),
    (settings) => listen(window, settings, listener),
    sameSettings,
  );
}
