import ts from "typescript";
import { descendants } from "../syntax";
import { at, type PrimitiveRule, type Rule } from "./library";

const errorModule = "internal-browser-api.ts";
const errorBoundary = "whereAllowed";

const caughtErrors: Rule = (library) =>
  library.modules.flatMap((module) =>
    descendants(module.source)
      .filter((node): node is ts.CatchClause => ts.isCatchClause(node))
      .filter((node) => {
        const owner = ts.findAncestor(node, ts.isFunctionDeclaration);
        return !(module.file === errorModule && owner?.name?.text === errorBoundary);
      })
      .map(
        (node) =>
          `${at(module, node)}: catch: nothing in the primitives package catches an error but ${errorBoundary} in ${errorModule}. Find a missing browser API with browserApi, and let any other error reach the caller.`,
      ),
  );

export const caughtErrorsRule: PrimitiveRule = {
  description: "nothing catches an error except whereAllowed in internal-browser-api.ts",
  rule: caughtErrors,
};
