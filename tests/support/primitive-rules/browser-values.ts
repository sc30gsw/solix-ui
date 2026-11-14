import ts from "typescript";
import { descendants } from "../syntax";
import {
  at,
  callsOneOf,
  exportedFunction,
  functionNameFor,
  type PrimitiveRule,
  publicModules,
  reachesThrough,
  returnsAlias,
  type Rule,
} from "./library";

const browserValueHelpers = ["createBrowserValue", "createElementValue"];
const browserValueType = "BrowserValue";
const brandModule = "internal-browser-value.ts";

const browserValues: Rule = (library) =>
  publicModules(library)
    .filter((module) =>
      reachesThrough(library, module, (found) => callsOneOf(found, browserValueHelpers)),
    )
    .flatMap((module) => {
      const fn = exportedFunction(module);
      return fn && returnsAlias(library, fn, browserValueType)
        ? []
        : [
            `${at(module, fn?.name ?? fn)}: ${functionNameFor(module.file)} reaches ${browserValueHelpers.join(" or ")}, so it returns its value as ${browserValueType}, alone or in a tuple or object.`,
          ];
    });

export const browserValuesRule: PrimitiveRule = {
  description:
    "every public module that reaches createBrowserValue or createElementValue returns a BrowserValue, alone or in a tuple or object",
  rule: browserValues,
};

function assertsTheBrand(node: ts.Node): boolean {
  return (
    (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) &&
    ts.isTypeReferenceNode(node.type) &&
    node.type.typeName.getText() === browserValueType
  );
}

const browserValueAssertions: Rule = (library) =>
  library.modules.flatMap((module) => {
    const assertions = descendants(module.source).filter(assertsTheBrand);
    const allowed = module.file === brandModule ? 1 : 0;
    return assertions
      .slice(allowed)
      .map(
        (node) =>
          `${at(module, node)}: ${node.getText().split("\n")[0]}: a value becomes a ${browserValueType} only through the helpers in ${brandModule}, which hold its one assertion. Build it with createBrowserValue, createBrowserSignal or mapBrowserValue.`,
      );
  });

export const browserValueAssertionsRule: PrimitiveRule = {
  description: `nothing asserts a type to ${browserValueType} but the one assertion in ${brandModule}`,
  rule: browserValueAssertions,
};
