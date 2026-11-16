export type Attributes = [string, string | true][];
export type Element = { tag: string; attributes: Attributes };

const startTag = /<([a-z][a-z0-9-]*)((?:\s+[^\s=>]+(?:=(?:"[^"]*"|[^\s">]+))?)*)\s*\/?>/g;
const attribute = /\s+([^\s=>]+)(?:=(?:"([^"]*)"|([^\s">]+)))?/g;

function attributesIn(written: string): Attributes {
  return [...written.matchAll(attribute)].map(([, name, quoted, bare]): [string, string | true] => [
    name,
    quoted ?? bare ?? true,
  ]);
}

export function elementsOf(html: string): Element[] {
  return [...html.matchAll(startTag)].map(([, tag, written]) => ({
    tag,
    attributes: attributesIn(written),
  }));
}

export function rootElementOf(html: string): Element {
  const [root] = elementsOf(html);
  if (!root || !html.startsWith(`<${root.tag}`)) {
    throw new Error(`The rendered markup does not start with an element: ${html}`);
  }
  return root;
}

export function elementCarrying(html: string, className: string): Element {
  const carrying = elementsOf(html).filter((element) => classesOf(element).includes(className));
  if (carrying.length !== 1) {
    throw new Error(
      `The rendered markup holds ${carrying.length} elements with ${className}: ${html}`,
    );
  }
  return carrying[0];
}

const tag = /<(\/?)([a-z][a-z0-9-]*)(?:\s[^>]*?)?(\/?)>/g;
const voidElements = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

export function topLevelTags(html: string): string[] {
  let depth = 0;
  const found: string[] = [];
  for (const [, closing, name, selfClosing] of html.matchAll(tag)) {
    if (closing) {
      depth -= 1;
      continue;
    }
    if (depth === 0) found.push(name);
    if (!selfClosing && !voidElements.has(name)) depth += 1;
  }
  return found;
}

export function rulesOf(html: string): string[] {
  return [...html.matchAll(/<style[^>]*>([^<]*)<\/style>/g)].map(([, rules]) => rules);
}

export function valuesOf(element: Element, name: string): (string | true)[] {
  return element.attributes.filter(([found]) => found === name).map(([, value]) => value);
}

export function classesOf(element: Element): string[] {
  return String(valuesOf(element, "class")[0] ?? "")
    .split(/\s+/)
    .filter((found) => found !== "");
}

export function declarationsIn(style: string | true | undefined): [string, string][] {
  if (typeof style !== "string") return [];
  return style
    .split(";")
    .filter((declaration) => declaration.trim() !== "")
    .map((declaration): [string, string] => {
      const colon = declaration.indexOf(":");
      return [declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()];
    });
}
