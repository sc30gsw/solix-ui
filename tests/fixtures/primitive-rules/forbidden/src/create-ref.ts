import {
  createEffect,
  createMemo,
} from "solid-js";
import { trap } from "#/tests/fixtures/primitive-rules/forbidden/src/internal-trap.ts";
import type { RefSetter } from "#/packages/primitives/src/types.ts";

/** Holds what the rules forbid. */
export function createRef(): RefSetter<HTMLElement> {
  const current = createMemo(() => undefined);
  createEffect(current, () => undefined);
  return (element) => trap(element);
}
