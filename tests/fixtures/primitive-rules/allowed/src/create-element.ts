import { access } from "../../../../../packages/primitives/src/internal-access";
import { createElementAttachmentWhen } from "../../../../../packages/primitives/src/internal-attachment";
import type { MaybeAccessor, RefSetter } from "../../../../../packages/primitives/src/types";

export function createElement(active: MaybeAccessor<boolean>): RefSetter<HTMLElement> {
  return createElementAttachmentWhen<HTMLElement, HTMLElement>(
    () => () => undefined,
    (element) => (access(active) ? element : undefined),
  );
}
