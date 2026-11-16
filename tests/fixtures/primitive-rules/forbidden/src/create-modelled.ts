import { createValue } from "../../../../../packages/primitives/src/internal-value";
import { moveFocus } from "./internal-focus";

/** Holds what the rules forbid. */
export function createModelled(element: HTMLElement) {
  moveFocus(element);
  return createValue(0).get;
}
