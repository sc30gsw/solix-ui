export type Focusable = HTMLElement | SVGElement;

export function isFocusTarget(node: unknown): node is Focusable {
  return node instanceof HTMLElement || node instanceof SVGElement;
}

export function activeElementOf(node: Node): Element | null {
  const root = node.getRootNode();
  return root instanceof Document || root instanceof ShadowRoot ? root.activeElement : null;
}

export function deepActiveElement(page: Document): Element | null {
  const found = { active: page.activeElement };
  while (found.active?.shadowRoot?.activeElement) {
    found.active = found.active.shadowRoot.activeElement;
  }
  return found.active;
}

export function containsComposed(ancestor: Node, node: Node): boolean {
  const walker: { at: Node | null } = { at: node };
  while (walker.at !== null) {
    if (walker.at === ancestor) return true;
    const parent: Node | null = walker.at.parentNode;
    walker.at = parent instanceof ShadowRoot ? parent.host : parent;
  }
  return false;
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
