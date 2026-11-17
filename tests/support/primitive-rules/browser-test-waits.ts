import { descendants, findAncestor, firstLine, nameOf, ts } from "#/scripts/syntax.ts";
import {
  browserTests,
  type Library,
  type PrimitiveRule,
  refersToDomMember,
  type Rule,
  testAt,
} from "#/tests/support/primitive-rules/library.ts";

const timeoutOption = "timeout";
const timers = ["setTimeout", "setInterval"];
const countComparisons = ["toBeGreaterThan", "toBeGreaterThanOrEqual"];
const countOperators = [ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.GreaterThanEqualsToken];
const count = "length";
const assertion = "expect";

function isCount(node: ts.Node | undefined): boolean {
  return node !== undefined && ts.isPropertyAccessExpression(node) && node.name.text === count;
}

function isAsserted(node: ts.Node): boolean {
  return (
    findAncestor(
      node.parent,
      (ancestor) =>
        ts.isCallExpression(ancestor) &&
        ts.isIdentifier(ancestor.expression) &&
        ancestor.expression.text === assertion,
    ) !== undefined
  );
}

function waitsByItself(library: Library, node: ts.Node): boolean {
  if (
    ts.isPropertyAssignment(node) &&
    node.name.getText() === timeoutOption &&
    ts.isNumericLiteral(node.initializer)
  ) {
    return true;
  }
  if (ts.isBinaryExpression(node) && countOperators.includes(node.operatorToken.kind)) {
    return isCount(node.left) && isAsserted(node);
  }
  if (
    refersToDomMember(
      library,
      node,
      (declaration) => timers.includes(nameOf(declaration)),
      library.compiledTests,
    )
  ) {
    return true;
  }
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false;
  if (!countComparisons.includes(node.expression.name.text)) return false;
  const asserted = node.expression.expression;
  return ts.isCallExpression(asserted) && isCount(asserted.arguments[0]);
}

const browserTestWaits: Rule = (library) =>
  browserTests(library).flatMap(([file, source]) =>
    descendants(source)
      .filter((node) => waitsByItself(library, node))
      .map(
        (node) =>
          `${testAt(library, file, source, node)}: ${firstLine(node)}: poll with engineWait, wait with reported, or assert that nothing happened once witnessed has seen a control, all from tests/support/dom.ts.`,
      ),
  );

export const browserTestWaitsRule: PrimitiveRule = {
  description:
    "a browser test writes no timeout property whose value is a number literal, refers in its own file to no setTimeout or setInterval of the DOM, by any name, and asserts no .length with a greater-than comparison",
  rule: browserTestWaits,
};
