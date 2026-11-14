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
