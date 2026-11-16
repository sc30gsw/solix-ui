import {
  createEffect,
  createMemo,
} from "solid-js";
import { trap } from "./internal-trap";
import type { RefSetter } from "../../../../../packages/primitives/src/types";

/** Holds what the rules forbid. */
export function createRef(): RefSetter<HTMLElement> {
  const current = createMemo(() => undefined);
  createEffect(current, () => undefined);
  return (element) => trap(element);
}
