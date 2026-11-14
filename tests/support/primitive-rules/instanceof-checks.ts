import ts from "typescript";
import { descendants } from "../syntax";
import { at, type PrimitiveRule, type Rule } from "./library";

const instanceofChecks: Rule = (library) =>
  library.modules.flatMap((module) =>
    descendants(module.source)
      .filter(
        (node) =>
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword,
      )
      .map(
        (node) =>
          `${at(module, node)}: ${node.getText()}: a class from this window does not match a node or event from a frame's. Tell nodes and events apart with the checks in internal-node.ts.`,
      ),
  );

export const instanceofChecksRule: PrimitiveRule = {
  description: "no source uses instanceof",
  rule: instanceofChecks,
};
