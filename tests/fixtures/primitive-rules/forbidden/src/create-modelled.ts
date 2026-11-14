import { moveFocus } from "./internal-focus";
import { createValue } from "./internal-value";

export function createModelled(element: HTMLElement) {
  moveFocus(element);
  return createValue(0).get;
}
