const elementNode = 1;
const documentNode = 9;
const fragmentNode = 11;
const htmlNamespace = "http://www.w3.org/1999/xhtml";
const svgNamespace = "http://www.w3.org/2000/svg";

export function isNode(value: unknown): value is Node {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "nodeType") === "number"
  );
}

export function isElement(value: unknown): value is Element {
  return isNode(value) && value.nodeType === elementNode;
}

export function isHtmlElement(value: unknown): value is HTMLElement {
  return isElement(value) && value.namespaceURI === htmlNamespace;
}

export function isHtmlOrSvgElement(value: unknown): value is HTMLElement | SVGElement {
  return (
    isElement(value) &&
    (value.namespaceURI === htmlNamespace || value.namespaceURI === svgNamespace)
  );
}

export function isDocument(value: unknown): value is Document {
  return isNode(value) && value.nodeType === documentNode;
}

export function isShadowRoot(value: unknown): value is ShadowRoot {
  return isNode(value) && value.nodeType === fragmentNode && Reflect.has(value, "host");
}

export function isInputOfType(value: unknown, type: string): value is HTMLInputElement {
  return isHtmlElement(value) && value.localName === "input" && Reflect.get(value, "type") === type;
}

export function isEvent(value: unknown): value is Event {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "preventDefault") === "function" &&
    typeof Reflect.get(value, "eventPhase") === "number"
  );
}

export type BrowserWindow = Window & typeof globalThis;

export function viewOf(node: Node): BrowserWindow | null {
  return (isDocument(node) ? node : node.ownerDocument)?.defaultView ?? null;
}
