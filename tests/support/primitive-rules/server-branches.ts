import ts from "typescript";
import { descendants, unwrapped } from "../syntax";
import { at, type PrimitiveRule, type Rule } from "./library";

const serverBranches = ["window", "document"];
const serverFlag = "isServer";

const serverBranchesAvoided: Rule = (library) =>
  library.modules.flatMap((module) =>
    descendants(module.source)
      .filter(
        (node) =>
          (ts.isIdentifier(node) && node.text === serverFlag) ||
          (ts.isTypeOfExpression(node) &&
            ts.isIdentifier(unwrapped(node.expression)) &&
            serverBranches.includes(unwrapped(node.expression).getText())),
      )
      .map(
        (node) =>
          `${at(module, node)}: ${node.getText()}: a primitive creates the same reactive nodes on the server and in the browser, so it never asks where it runs. Read a browser global only in an effect's apply or a handler, which the server never runs.`,
      ),
  );

export const serverBranchesRule: PrimitiveRule = {
  description: "no primitive reads isServer, or applies typeof to window or document",
  rule: serverBranchesAvoided,
};
