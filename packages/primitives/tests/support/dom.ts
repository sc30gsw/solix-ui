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

export const engineTimeout = 2_000;

export const engineWait = { timeout: engineTimeout, interval: 10 } as const;

export async function reported(check: () => boolean, what: string): Promise<void> {
  const deadline = performance.now() + engineTimeout;
  while (!check()) {
    if (performance.now() > deadline) throw new Error(`the engine never reported ${what}`);
    await nextTask();
  }
}

export async function witnessed<T>(
  control: readonly T[],
  sees: (seen: readonly T[]) => boolean,
  what: string,
): Promise<void> {
  await reported(() => sees(control), `${what} to a control`);
}

type ObservedBy = {
  ResizeObserver: ResizeObserverEntry;
  IntersectionObserver: IntersectionObserverEntry;
  MutationObserver: MutationRecord;
};

type ControlObserver<T> = new (callback: (entries: T[]) => void) => {
  observe(target: Element, init?: object): void;
  disconnect(): void;
};

export function controlFor<N extends keyof ObservedBy>(
  name: N,
  element: Element,
  init?: object,
): { seen: ObservedBy[N][]; disconnect: () => void } {
  const seen: ObservedBy[N][] = [];
  const classes: Record<string, unknown> = Object.fromEntries(
    Object.entries({ ResizeObserver, IntersectionObserver, MutationObserver }),
  );
  const Observer = classes[name] as ControlObserver<ObservedBy[N]>;
  const observer = new Observer((entries) => seen.push(...entries));
  observer.observe(element, init);
  return { seen, disconnect: () => observer.disconnect() };
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
