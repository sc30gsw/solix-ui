import { access } from "../../../../../packages/primitives/src/internal-access";
import { createElementAttachment } from "../../../../../packages/primitives/src/internal-attachment";
import { listenAsAsked, listenerSettings } from "../../../../../packages/primitives/src/internal-listener";
import type { MaybeAccessor, RefSetter } from "../../../../../packages/primitives/src/types";

export function createEventListener(type: MaybeAccessor<string>): RefSetter<HTMLElement> {
  return createElementAttachment(
    (element: HTMLElement | undefined) =>
      element && { target: element, ...listenerSettings(access(type)) },
    (current) => listenAsAsked(current.target, current, () => undefined),
  );
}
