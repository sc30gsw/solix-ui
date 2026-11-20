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

function readTop(element: Element): number {
  return element.scrollTop;
}

export { readTop as topOf };
