import { watchEvents } from "#/packages/primitives/src/internal-listener.ts";
import { createValue } from "#/packages/primitives/src/internal-value.ts";
import { moveFocus } from "#/tests/fixtures/primitive-rules/forbidden/src/internal-focus.ts";

/** Holds what the rules forbid. */
export function createModelled(element: HTMLElement) {
  const stop = watchEvents(element, ["focus"], () => void element.clientHeight);
  const unrelated = watchEvents(element, ["scroll"], () => void element.clientWidth);
  moveFocus(element);
  return [createValue(0).get, stop, unrelated];
}
