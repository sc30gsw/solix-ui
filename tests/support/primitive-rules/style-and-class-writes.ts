import { descendants, stringsIn, ts, unwrapped } from "../syntax";
import { at, type Library, type PrimitiveRule, type Rule } from "./library";

const styleAndClassMembers = ["style", "className", "classList", "attributeStyleMap"];

const writersOf: Record<string, string[]> = {
  classList: ["add", "remove", "toggle", "replace"],
  style: ["setProperty", "removeProperty"],
  attributeStyleMap: ["set", "append", "delete", "clear"],
};

const attributeNameAt: Record<string, number> = {
  setAttribute: 0,
  toggleAttribute: 0,
  removeAttribute: 0,
  createAttribute: 0,
  setAttributeNS: 1,
  removeAttributeNS: 1,
  createAttributeNS: 1,
};

const elementNameAt: Record<string, number> = { createElement: 0, createElementNS: 1 };

const styleAndClassAttributes = ["class", "style"];

const styleElement = "style";

const adoptedStyleSheets = "adoptedStyleSheets";

const objectAssign = "Object.assign";

function memberName(library: Library, expression: ts.Expression): string | undefined {
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  if (ts.isElementAccessExpression(expression)) {
    return stringsIn(library.compiled, expression.argumentExpression)[0];
  }
  return undefined;
}

function touchesStyleOrClass(library: Library, expression: ts.Expression): boolean {
  const value = unwrapped(expression);
  if (!ts.isPropertyAccessExpression(value) && !ts.isElementAccessExpression(value)) return false;
  return (
    styleAndClassMembers.includes(memberName(library, value) ?? "") ||
    touchesStyleOrClass(library, value.expression)
  );
}

function writesStyleOrClass(library: Library, node: ts.Node): boolean {
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
    node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
  ) {
    return touchesStyleOrClass(library, node.left);
  }
  if (
    (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
    memberName(library, node) === adoptedStyleSheets
  ) {
    return true;
  }
  if (!ts.isCallExpression(node)) return false;
  const callee = unwrapped(node.expression);
  if (callee.getText() === objectAssign) {
    return node.arguments[0] !== undefined && touchesStyleOrClass(library, node.arguments[0]);
  }
  if (!ts.isPropertyAccessExpression(callee)) return false;
  const method = callee.name.text;
  const owner = memberName(library, unwrapped(callee.expression)) ?? "";
  const nameIn = (position: number | undefined) =>
    position === undefined ? [] : stringsIn(library.compiled, node.arguments[position]);
  return (
    (writersOf[owner]?.includes(method) ?? false) ||
    nameIn(attributeNameAt[method]).some((name) =>
      styleAndClassAttributes.includes(name.toLowerCase()),
    ) ||
    nameIn(elementNameAt[method]).some((name) => name.toLowerCase() === styleElement)
  );
}

const styleAndClassWrites: Rule = (library) =>
  library.modules.flatMap((module) =>
    descendants(module.source)
      .filter((node) => writesStyleOrClass(library, node))
      .map(
        (node) =>
          `${at(module, node)}: ${node.getText().split("\n")[0]}: a primitive writes no style and no class. Return the state, and let the component that renders the element style it, so a consumer's class and style keep their precedence.`,
      ),
  );

export const styleAndClassWritesRule: PrimitiveRule = {
  description: "no primitive writes a style or a class",
  rule: styleAndClassWrites,
};
