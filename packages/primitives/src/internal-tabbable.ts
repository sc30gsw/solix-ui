export type Focusable = HTMLElement | SVGElement;

const ownTabStops =
  "input[type=date], input[type=time], input[type=datetime-local], input[type=month], input[type=week], audio[controls], video[controls], iframe, object, embed";
const autofocus = "[data-autofocus]";
const inert = "[inert]";
const anyElement = "*";
const radio = "radio";

export function isFocusable(element: Element): element is Focusable {
  return (
    (element instanceof HTMLElement || element instanceof SVGElement) &&
    (element.tabIndex >= 0 || element.hasAttribute("tabindex")) &&
    !element.matches(":disabled") &&
    element.closest(inert) === null &&
    element.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true })
  );
}

function isTabStop(element: Element): element is Focusable {
  return isFocusable(element) && element.tabIndex >= 0;
}

function radioGroupOf(element: Element, among: readonly Focusable[]): HTMLInputElement[] {
  if (!(element instanceof HTMLInputElement) || element.type !== radio || element.name === "") {
    return [];
  }
  return among.filter(
    (other): other is HTMLInputElement =>
      other instanceof HTMLInputElement &&
      other.type === radio &&
      other.name === element.name &&
      other.form === element.form,
  );
}

function representativeOf(
  group: readonly HTMLInputElement[],
  backwards: boolean,
): HTMLInputElement | undefined {
  return group.find((member) => member.checked) ?? (backwards ? group.at(-1) : group[0]);
}

export function tabStops(container: Element, backwards: boolean): Focusable[] {
  const candidates = [...container.querySelectorAll(anyElement)].filter(isTabStop);
  const kept = candidates.filter((element) => {
    const group = radioGroupOf(element, candidates);
    return group.length === 0 || representativeOf(group, backwards) === element;
  });
  const positive = kept
    .filter((element) => element.tabIndex > 0)
    .sort((left, right) => left.tabIndex - right.tabIndex);
  return [...positive, ...kept.filter((element) => element.tabIndex === 0)];
}

function follows(reference: Element, other: Element): boolean {
  return (reference.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

export function nextTabStop(
  container: Element,
  current: Element | null,
  backwards: boolean,
): Focusable | undefined {
  const stops = tabStops(container, backwards);
  if (stops.length === 0) return undefined;
  const last = stops.length - 1;
  if (current === null || current === container || !container.contains(current)) {
    return backwards ? stops[last] : stops[0];
  }
  const group = radioGroupOf(
    current,
    [...container.querySelectorAll(anyElement)].filter(isTabStop),
  );
  const index = stops.findIndex((stop) => stop === (representativeOf(group, backwards) ?? current));
  if (index !== -1) {
    return stops[(index + (backwards ? last : 1)) % stops.length];
  }
  const firstInOrder = stops.findIndex((stop) => stop.tabIndex === 0);
  const zeroStart = firstInOrder === -1 ? stops.length : firstInOrder;
  if (!backwards) {
    const after = stops.findIndex((stop, at) => at >= zeroStart && follows(current, stop));
    return stops[after === -1 ? 0 : after];
  }
  const before = stops.findLastIndex((stop, at) => at >= zeroStart && follows(stop, current));
  if (before !== -1) return stops[before];
  return stops[zeroStart === 0 ? last : zeroStart - 1];
}

export function initialFocusTarget(container: Element): Focusable | undefined {
  const marked = [...container.querySelectorAll(autofocus)].find(isFocusable);
  if (marked) return marked;
  const first = tabStops(container, false)[0];
  if (first) return first;
  const focusable = [...container.querySelectorAll(anyElement)].find(isFocusable);
  if (focusable) return focusable;
  return isFocusable(container) ? container : undefined;
}

export function hasOwnTabStops(element: Element): boolean {
  return element.matches(ownTabStops);
}
