import { createEffect, createMemo } from "solid-js";
import type { RefSetter } from "./types";

export function createElementAttachment<E extends Element>(attach: (element: E) => void): RefSetter<E> {
  const current = createMemo(() => undefined);
  createEffect(current, () => undefined);
  return attach;
}
