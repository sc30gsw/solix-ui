import ts from "typescript";
import { observerNames } from "../../../packages/primitives/src/internal-dom-observer";
import { descendants, isCallTo } from "../syntax";
import { at, type PrimitiveRule, type Rule, stringsIn } from "./library";

const observerModule = "internal-dom-observer.ts";
const names: readonly string[] = observerNames;

const observerConstruction: Rule = (library) =>
  library.modules
    .filter(({ file }) => file !== observerModule)
    .flatMap((module) =>
      descendants(module.source)
        .filter(
          (node) =>
            (ts.isNewExpression(node) && names.includes(node.expression.getText())) ||
            (isCallTo(node, "lookUp") &&
              stringsIn(library, node.arguments[1]).some((name) => names.includes(name))),
        )
        .map(
          (node) =>
            `${at(module, node)}: ${node.getText().split("\n")[0]}: observe through observe in ${observerModule}, which looks the class up on the target's window and disconnects it.`,
        ),
    );

export const observerConstructionRule: PrimitiveRule = {
  description: "only internal-dom-observer.ts constructs or looks up an observer",
  rule: observerConstruction,
};
