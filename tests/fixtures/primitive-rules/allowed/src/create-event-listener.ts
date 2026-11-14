import { createElementAttachment } from "./internal-attachment";
import { listen } from "./internal-listener";
import type { RefSetter } from "./types";

export function createEventListener(type: string): RefSetter<HTMLElement> {
  return createElementAttachment<HTMLElement>((element) => {
    listen(element, type, () => undefined);
  });
}
