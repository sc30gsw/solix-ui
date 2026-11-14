import { userEvent } from "vite-plus/test/browser";

export function attached<E extends Element>(element: E, parent: ParentNode = document.body): E {
  parent.append(element);
  return element;
}

export function html<E extends HTMLElement = HTMLElement>(markup: string): E {
  const template = document.createElement("template");
  template.innerHTML = markup.trim();
  const [element] = template.content.children;
  if (!(element instanceof HTMLElement)) throw new Error(`${markup} holds no HTML element.`);
  return attached(element as E);
}

export function button(id: string, parent?: ParentNode): HTMLButtonElement {
  const element = document.createElement("button");
  element.id = id;
  element.textContent = id;
  return attached(element, parent);
}

export function box(label: string, parent?: ParentNode): HTMLDivElement {
  const element = document.createElement("div");
  element.textContent = label;
  element.style.padding = "8px";
  return attached(element, parent);
}

export function focusedId(): string {
  const active = document.activeElement;
  return active === null || active === document.body ? "nothing" : active.id || active.tagName;
}

export function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function settled(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

export function tab(backwards = false): Promise<void> {
  return userEvent.keyboard(backwards ? "{Shift>}{Tab}{/Shift}" : "{Tab}");
}

export function press(down: Element, up: Element = down): Promise<void> {
  return userEvent.pointer([
    { target: down, keys: "[MouseLeft>]" },
    { target: up, keys: "[/MouseLeft]" },
  ]);
}

export function pointer(type: string, target: EventTarget, pointerId = 1): PointerEvent {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId,
  });
  target.dispatchEvent(event);
  return event;
}
