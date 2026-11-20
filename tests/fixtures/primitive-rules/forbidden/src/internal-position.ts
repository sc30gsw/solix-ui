import type { Listener as Heard } from "#/packages/primitives/src/internal-listener.ts";

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
