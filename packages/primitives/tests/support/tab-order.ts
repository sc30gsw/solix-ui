import { tab } from "#/tests/support/dom.ts";

export type Kind = "button" | "input" | "textarea" | "div";
export type Change = "disabled" | "minus" | "hidden" | "inert";
export type Slot = { wrapper: HTMLElement; control: HTMLElement; kind: Kind };
export type Step =
  | { type: "tab"; backwards: boolean }
  | { type: "add"; at: number; kind: Kind }
  | { type: "remove"; at: number }
  | { type: "toggle"; at: number; change: Change };

export const kinds: readonly Kind[] = ["button", "input", "textarea", "div"];
export const changes: readonly Change[] = ["disabled", "minus", "hidden", "inert"];

function slot(kind: Kind, name: string): Slot {
  const wrapper = document.createElement("div");
  const control = document.createElement(kind);
  if (kind === "div") control.tabIndex = 0;
  control.setAttribute("aria-label", name);
  if (kind === "button") control.textContent = name;
  wrapper.append(control);
  return { wrapper, control, kind };
}

export function apply(step: Step, slots: Slot[], container: HTMLElement, name: string): void {
  if (step.type === "add") {
    const added = slot(step.kind, name);
    const at = slots.length === 0 ? 0 : step.at % (slots.length + 1);
    container.insertBefore(added.wrapper, slots[at]?.wrapper ?? null);
    slots.splice(at, 0, added);
    return;
  }
  if (step.type === "tab" || slots.length === 0) return;
  const at = step.at % slots.length;
  const target = slots[at];
  if (step.type === "remove") {
    target.wrapper.remove();
    slots.splice(at, 1);
    return;
  }
  if (step.change === "disabled") {
    target.control.toggleAttribute("disabled", !target.control.hasAttribute("disabled"));
  } else if (step.change === "minus") {
    target.control.tabIndex = target.control.tabIndex === -1 ? 0 : -1;
  } else if (step.change === "hidden") {
    target.wrapper.hidden = !target.wrapper.hidden;
  } else {
    target.wrapper.inert = !target.wrapper.inert;
  }
}

export async function engineOrder(start: HTMLElement, mirror: readonly Slot[]): Promise<number[]> {
  const order: number[] = [];
  start.focus();
  for (let press = 0; press <= mirror.length; press += 1) {
    await tab();
    const at = mirror.findIndex(({ control }) => control === document.activeElement);
    if (at === -1) break;
    order.push(at);
  }
  return order;
}

export function expectedAfter(
  before: Element | null,
  backwards: boolean,
  order: readonly number[],
  slots: readonly Slot[],
  container: HTMLElement,
): Element | undefined {
  if (order.length === 0) return container;
  const sequence = backwards ? [...order].reverse() : [...order];
  if (before === container) return slots[sequence[0]].control;
  const at = slots.findIndex(({ control }) => control === before);
  if (at === -1) return undefined;
  const position = order.indexOf(at);
  if (position !== -1) {
    const next = (position + (backwards ? order.length - 1 : 1)) % order.length;
    return slots[order[next]].control;
  }
  const following = sequence.find((index) => (backwards ? index < at : index > at));
  return slots[following ?? sequence[0]].control;
}
