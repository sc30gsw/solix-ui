import { createMemo } from "solid-js";
import { createSignal } from "solid-js";
import type { RefSetter } from "#/packages/primitives/src/types.ts";

/** Holds what the rules forbid. */
export function createSized(): { ref: RefSetter<HTMLElement>; width: () => number } {
  const width = createMemo(() => 0);
  const [height] = createSignal(0);
  return { ref: () => height(), width };
}
