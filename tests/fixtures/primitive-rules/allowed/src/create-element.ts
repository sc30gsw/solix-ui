import { createElementAttachment } from "../../../../../packages/primitives/src/internal-attachment";
import type { RefSetter } from "../../../../../packages/primitives/src/types";

export function createElement(): RefSetter<HTMLElement> {
  return createElementAttachment<HTMLElement, HTMLElement>(
    (element) => element,
    () => () => undefined,
  );
}
