import ts from "typescript";
import { descendants } from "../syntax";
import { browserTestSuffixes, type PrimitiveRule, type Rule, testAt } from "./library";

const timeoutOption = "timeout";
const sleep = "setTimeout";
const countComparison = "toBeGreaterThan";

function waitsByItself(node: ts.Node): boolean {
  if (
    ts.isPropertyAssignment(node) &&
    node.name.getText() === timeoutOption &&
    ts.isNumericLiteral(node.initializer)
  ) {
    return true;
  }
  if (!ts.isCallExpression(node)) return false;
  if (ts.isIdentifier(node.expression) && node.expression.text === sleep) return true;
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  if (node.expression.name.text !== countComparison) return false;
  const asserted = node.expression.expression;
  return (
    ts.isCallExpression(asserted) &&
    asserted.arguments[0] !== undefined &&
    ts.isPropertyAccessExpression(asserted.arguments[0]) &&
    asserted.arguments[0].name.text === "length"
  );
}

const browserTestWaits: Rule = (library) =>
  [...library.tests]
    .filter(([file]) => browserTestSuffixes.some((suffix) => file.endsWith(suffix)))
    .flatMap(([file, source]) =>
      descendants(source)
        .filter(waitsByItself)
        .map(
          (node) =>
            `${testAt(library, file, source, node)}: ${node.getText().split("\n")[0]}: wait for the browser only through reported and witnessed in tests/support/dom.ts, with its engine timeout, and assert that nothing happened once a control has seen the event.`,
        ),
    );

export const browserTestWaitsRule: PrimitiveRule = {
  description:
    "a browser test writes no timeout and no sleep of its own, and compares no count of recorded events with toBeGreaterThan",
  rule: browserTestWaits,
};
