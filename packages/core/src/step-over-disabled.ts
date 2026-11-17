type Step = { first: (from: number, count: number) => number; by: 1 | -1; wraps: boolean };

const disabled = ':disabled, [aria-disabled="true"]';
const orientation = "data-orientation";
const vertical = "vertical";
const rightToLeft = "rtl";

function stepFor(key: string, container: HTMLElement, loop: boolean): Step | undefined {
  const [forward, backward] =
    container.getAttribute(orientation) === vertical
      ? ["ArrowDown", "ArrowUp"]
      : getComputedStyle(container).direction === rightToLeft
        ? ["ArrowLeft", "ArrowRight"]
        : ["ArrowRight", "ArrowLeft"];
  if (key === forward) return { first: (from) => from + 1, by: 1, wraps: loop };
  if (key === backward) return { first: (from) => from - 1, by: -1, wraps: loop };
  if (key === "Home") return { first: () => 0, by: 1, wraps: false };
  if (key === "End") return { first: (_, count) => count - 1, by: -1, wraps: false };
  return undefined;
}

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
    const step = stepFor(event.key, container, options.loop());
    if (from === -1 || step === undefined) return;
    const at = (index: number) => items[step.wraps ? (index + items.length) % items.length : index];
    const first = step.first(from, items.length);
    if (at(first)?.matches(disabled) !== true) return;
    event.preventDefault();
    for (let walked = 1; walked < items.length; walked += 1) {
      const next = at(first + walked * step.by);
      if (next === undefined || next === items[from]) return;
      if (next.matches(disabled)) continue;
      next.focus();
      const value = valueOf.get(next);
      if (value !== undefined) options.activate(value());
      return;
    }
  };
  return {
    onKeyDown,
    item: (value) => (element) => valueOf.set(element, value),
  };
}
