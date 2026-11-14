import ts from "typescript";
import { descendants, unwrapped } from "../syntax";
import { at, type PrimitiveRule, type Rule } from "./library";

const serverBranches = ["window", "document"];
const serverFlag = "isServer";
const globalObject = "globalThis";
const serverEnvironment = "import.meta.env.SSR";

function asksWhereItRuns(node: ts.Node): boolean {
  if (ts.isIdentifier(node) && node.text === serverFlag) return true;
  if (ts.isTypeOfExpression(node)) {
    const operand = unwrapped(node.expression);
    return ts.isIdentifier(operand) && serverBranches.includes(operand.text);
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.InKeyword &&
    unwrapped(node.right).getText() === globalObject
  ) {
    return true;
  }
  if (ts.isPropertyAccessExpression(node)) {
    return (
      (node.expression.getText() === globalObject && serverBranches.includes(node.name.text)) ||
      node.getText() === serverEnvironment
    );
  }
  return false;
}

const serverBranchesAvoided: Rule = (library) =>
  library.modules.flatMap((module) =>
    descendants(module.source)
      .filter(asksWhereItRuns)
      .map(
        (node) =>
          `${at(module, node)}: ${node.getText()}: a primitive creates the same reactive nodes on the server and in the browser, so it never asks where it runs. Read a browser global only in a browser-value subscription, an attachment's attach function or a command, which the server never runs.`,
      ),
  );

export const serverBranchesRule: PrimitiveRule = {
  description:
    "no primitive asks where it runs: no isServer, no typeof of window or of document, no in globalThis, no globalThis.window or globalThis.document, and no import.meta.env.SSR",
  rule: serverBranchesAvoided,
};
