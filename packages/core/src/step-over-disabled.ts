import { stepPastDisabled } from "#/src/roving-step.ts";

const disabled = ':disabled, [aria-disabled="true"]';
const orientation = "data-orientation";
const vertical = "vertical";
const rightToLeft = "rtl";

export type SteppedList<Value> = {
  onKeyDown: (event: KeyboardEvent & { currentTarget: HTMLElement }) => void;
  item: (value: () => Value) => (element: Element) => void;
};

export function stepOverDisabled<Value>(options: {
  items: string;
  loop: () => boolean;
  activate: (value: Value) => void;
}): SteppedList<Value> {
  const valueOf = new WeakMap<Element, () => Value>();
  const onKeyDown = (event: KeyboardEvent & { currentTarget: HTMLElement }) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const container = event.currentTarget;
    const items = [...container.querySelectorAll<HTMLElement>(options.items)];
    const from = items.findIndex((item) => item === event.target);
    if (from === -1) return;
    const isVertical = container.getAttribute(orientation) === vertical;
    const step = stepPastDisabled(
      items.map((item) => item.matches(disabled)),
      from,
      event.key,
      {
        vertical: isVertical,
        rightToLeft: !isVertical && getComputedStyle(container).direction === rightToLeft,
        loop: options.loop(),
      },
    );
    if (!step.handled) return;
    event.preventDefault();
    const next = items[step.to];
    if (step.to === from || next === undefined) return;
    next.focus();
    const value = valueOf.get(next);
    if (value !== undefined) options.activate(value());
  };
  return {
    onKeyDown,
    item: (value) => (element) => valueOf.set(element, value),
  };
}
