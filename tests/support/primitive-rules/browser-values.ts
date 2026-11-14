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
