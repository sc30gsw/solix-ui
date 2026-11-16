import { activeElementOf } from "./internal-active";
import { isHtmlOrSvgElement } from "./internal-node";

export type Focusable = HTMLElement | SVGElement;

export function isFocusTarget(node: unknown): node is Focusable {
  return isHtmlOrSvgElement(node);
}

export function moveFocus(target: Focusable, options?: FocusOptions): boolean {
  target.focus(options);
  return activeElementOf(target) === target;
}

export function focusFirst(
  candidates: Iterable<Focusable>,
  options?: FocusOptions,
): Focusable | undefined {
  for (const candidate of candidates) {
    if (moveFocus(candidate, options)) return candidate;
  }
  return undefined;
}
