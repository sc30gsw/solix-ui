import { access } from "#/packages/primitives/src/internal-access.ts";
import { createElementAttachmentWhen } from "#/packages/primitives/src/internal-attachment.ts";
import type { MaybeAccessor, RefSetter } from "#/packages/primitives/src/types.ts";

/** Holds what the rules allow. */
export function createElement(active: MaybeAccessor<boolean>): RefSetter<HTMLElement> {
  return createElementAttachmentWhen<HTMLElement, HTMLElement>(
    () => () => undefined,
    (element) => (access(active) ? element : undefined),
  );
}
