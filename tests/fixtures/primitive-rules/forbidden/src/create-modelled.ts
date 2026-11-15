import { createValue } from "../../../../../packages/primitives/src/internal-value";
import { moveFocus } from "./internal-focus";

export function createModelled(element: HTMLElement) {
  moveFocus(element);
  return createValue(0).get;
}
