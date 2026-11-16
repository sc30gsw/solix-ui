import { createElementAttachment } from "../../../../../packages/primitives/src/internal-attachment";
import { watchEvents } from "../../../../../packages/primitives/src/internal-listener";
import type { RefSetter } from "../../../../../packages/primitives/src/types";

/** Holds what the rules allow. */
export function createMeasured(): [ref: RefSetter<HTMLElement>, width: () => number] {
  return [
    createElementAttachment<HTMLElement>((element) =>
      watchEvents(element, ["resize"], () => undefined),
    ),
    () => 0,
  ];
}
