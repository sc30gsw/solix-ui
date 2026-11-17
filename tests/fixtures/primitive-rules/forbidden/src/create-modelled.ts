import { createValue } from "#/packages/primitives/src/internal-value.ts";
import { moveFocus } from "#/tests/fixtures/primitive-rules/forbidden/src/internal-focus.ts";

/** Holds what the rules forbid. */
export function createModelled(element: HTMLElement) {
  moveFocus(element);
  return createValue(0).get;
}
