import { access } from "../../../../../packages/primitives/src/internal-access";
import { createElementAttachment } from "../../../../../packages/primitives/src/internal-attachment";
import { listenAsAsked, type ListenerSettings, listenerSettings } from "../../../../../packages/primitives/src/internal-listener";
import type { ListenerOptions, MaybeAccessor, RefSetter } from "../../../../../packages/primitives/src/types";

export function createEventListener(
  type: MaybeAccessor<string>,
  options?: MaybeAccessor<ListenerOptions | undefined>,
): RefSetter<HTMLElement> {
  return createElementAttachment<HTMLElement, ListenerSettings>(
    (element, settings) => listenAsAsked(element, settings, () => undefined),
    () => listenerSettings(access(type), access(options)),
  );
}
