import type { Focusable } from "./internal-focus";
import { isHtmlElement, isHtmlOrSvgElement, isInputOfType } from "./internal-node";

const autofocus = "[data-autofocus]";
const inert = "[inert]";
const disabled = ":disabled";
const tabindex = "tabindex";
const radio = "radio";

function treeOrder(root: ParentNode): Element[] {
  return Array.from(root.children).flatMap((element) => [
    element,
    ...(element.shadowRoot ? treeOrder(element.shadowRoot) : []),
    ...treeOrder(element),
  ]);
}

function isEditingHost(element: Element): boolean {
  return (
    isHtmlElement(element) &&
    element.isContentEditable &&
    !(element.parentElement?.isContentEditable ?? false)
  );
}

function isFocusable(element: Element): element is Focusable {
  return (
    isHtmlOrSvgElement(element) &&
    (element.tabIndex >= 0 || element.hasAttribute(tabindex) || isEditingHost(element)) &&
    !element.matches(disabled) &&
    element.closest(inert) === null &&
    element.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true })
  );
}

function isTabStop(element: Element): element is Focusable {
  return (
    isFocusable(element) &&
    (element.tabIndex >= 0 || (!element.hasAttribute(tabindex) && isEditingHost(element)))
  );
}

function radioGroupOf(element: Element, among: readonly Focusable[]): HTMLInputElement[] {
  if (!isInputOfType(element, radio) || element.name === "") {
    return [];
  }
  return among.filter(
    (other): other is HTMLInputElement =>
      isInputOfType(other, radio) && other.name === element.name && other.form === element.form,
  );
}

function representativeOf(
  group: readonly HTMLInputElement[],
  backwards: boolean,
): HTMLInputElement | undefined {
  return group.find((member) => member.checked) ?? (backwards ? group.at(-1) : group[0]);
}

export function tabStopCandidates(container: Element, backwards: boolean): Focusable[] {
  const stops = treeOrder(container).filter(isTabStop);
  const kept = stops.filter((element) => {
    const group = radioGroupOf(element, stops);
    return group.length === 0 || representativeOf(group, backwards) === element;
  });
  const positive = kept
    .filter((element) => element.tabIndex > 0)
    .sort((left, right) => left.tabIndex - right.tabIndex);
  const inOrder = [...positive, ...kept.filter((element) => element.tabIndex <= 0)];
  return backwards ? inOrder.reverse() : inOrder;
}

export function initialFocusCandidates(container: Element): Focusable[] {
  const inside = treeOrder(container);
  return [
    ...inside.filter((element) => element.matches(autofocus)).filter(isFocusable),
    ...tabStopCandidates(container, false),
    ...inside.filter(isFocusable),
  ];
}
