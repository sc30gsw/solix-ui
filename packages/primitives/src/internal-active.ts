import { isDocument, isShadowRoot } from "./internal-node";

export type ActivePath = { element: Element | null; roots: ShadowRoot[] };

export function activeElementOf(node: Node): Element | null {
  const root = node.getRootNode();
  return isDocument(root) || isShadowRoot(root) ? root.activeElement : null;
}

export function activePath(page: Document, deep = true): ActivePath {
  const path: ActivePath = { element: page.activeElement, roots: [] };
  while (deep && path.element?.shadowRoot) {
    path.roots.push(path.element.shadowRoot);
    const inner = path.element.shadowRoot.activeElement;
    if (!inner) break;
    path.element = inner;
  }
  return path;
}

export function deepActiveElement(page: Document): Element | null {
  return activePath(page).element;
}

export function containsComposed(ancestor: Node, node: Node): boolean {
  const walker: { at: Node | null } = { at: node };
  while (walker.at !== null) {
    if (walker.at === ancestor) return true;
    const parent: Node | null = walker.at.parentNode;
    walker.at = isShadowRoot(parent) ? parent.host : parent;
  }
  return false;
}
