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
