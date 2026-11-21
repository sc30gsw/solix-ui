import { type Listener as Heard, watchEvents } from "#/packages/primitives/src/internal-listener.ts";

export function verticalOffset(): number {
  return window.scrollY;
}

export class Measurer {
  readonly element: Element;

  constructor(element: Element) {
    this.element = element;
  }

  measure(): number {
    return this.element.clientHeight;
  }
}

export class Runner {
  readonly result: unknown;

  constructor(run: () => unknown) {
    this.result = run();
  }
}

function readTop(element: Element): number {
  return element.scrollTop;
}

export { readTop as topOf };

export class Base {
  readonly width: number;

  constructor(element: HTMLElement) {
    this.width = element.offsetWidth * 2;
  }
}

export class Sub extends Base {}

export class Field extends Base {
  readonly extra = 1;
}

type Listener = (event: Event) => void;

export function whenHeard(heard: Listener): Listener {
  heard(new Event("heard"));
  return heard;
}

export function storedNow(heard: Heard<Event>): void {
  let saved: Heard<Event> | undefined;
  saved = heard;
  saved(new Event("saved"));
}

export function boxedNow(heard: Heard<Event>): void {
  const boxed = { heard };
  boxed.heard(new Event("boxed"));
}

export type Handled = { scroll: Heard<Event> };

export function fireAll(handlers: { scroll: (event: Event) => void }): void {
  handlers.scroll(new Event("fired"));
}

export function wireDown(target: HTMLElement, handlers: { scroll: Heard<Event> }): () => void {
  fireAll(handlers);
  return watchEvents(target, ["scroll"], handlers.scroll);
}

const scrollKey = "scroll";

export function keyedNow(handlers: { scroll: Heard<Event> }): void {
  handlers[scrollKey](new Event("keyed"));
}

function announce(target: EventTarget, type: string): void {
  target.dispatchEvent(new Event(type));
}

export function announcedNow(element: HTMLElement): () => void {
  const stop = watchEvents(element, ["announced"], () => void (element.scrollTop + 6));
  announce(element, "announced");
  return stop;
}

export function clickedNow(element: HTMLElement): (() => void)[] {
  const stopClick = watchEvents(element, ["click"], () => void (element.offsetTop + 6));
  element.click();
  const stopBlur = watchEvents(element, ["blur"], () => void (element.offsetLeft + 6));
  element.blur();
  return [stopClick, stopBlur];
}
