import { createElementAttachment } from "./internal-attachment";
import type { RefSetter } from "./types";

export function createElement(): RefSetter<HTMLElement> {
  return createElementAttachment<HTMLElement>(() => undefined);
}
