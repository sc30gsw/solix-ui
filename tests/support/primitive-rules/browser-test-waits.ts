import {
  declarationsOf,
  descendants,
  fileOf,
  findAncestor,
  firstLine,
  isDomLibraryFile,
  nameOf,
  ts,
} from "../../../scripts/syntax";
import {
  browserTests,
  calleeName,
  type Library,
  type PrimitiveRule,
  type Rule,
  testAt,
} from "./library";

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
  if (!ts.isCallExpression(node)) return false;
  const callee = calleeName(node.expression);
  if (
    declarationsOf(library.compiledTests, callee).some(
      (declaration) =>
        isDomLibraryFile(fileOf(declaration)) && timers.includes(nameOf(declaration)),
    )
  ) {
    return true;
  }
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
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
    "a browser test writes no timeout number, calls no timer however it is reached, and asserts no count of recorded events with greater-than",
  rule: browserTestWaits,
};
