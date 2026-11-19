import { assertedType, returnsAlias } from "#/scripts/syntax.ts";
import {
  at,
  exportedFunctions,
  forbidOutside,
  type PrimitiveRule,
  publicModules,
  reaches,
  type Rule,
} from "#/tests/support/primitive-rules/library.ts";

const browserValueType = "BrowserValue";
const brandHome = { file: "internal-browser-value.ts", fn: "branded" };

const browserValues: Rule = (library) =>
  publicModules(library).flatMap((module) => {
    const { first: fn, all } = exportedFunctions(module);
    if (!fn || !reaches(library, all, { file: brandHome.file, name: brandHome.fn })) {
      return [];
    }
    return returnsAlias(library.compiled, fn, browserValueType)
      ? []
      : [
          `${at(module, fn.name)}: ${fn.name.text} reaches ${brandHome.fn}, the one place a value becomes a ${browserValueType}, so it returns its value as ${browserValueType}, alone or in a tuple or object.`,
        ];
  });

export const browserValuesRule: PrimitiveRule = {
  description: `every public primitive that reaches ${brandHome.fn} in ${brandHome.file} returns a ${browserValueType}, alone or in a tuple or object`,
  rule: browserValues,
};

export const browserValueAssertionsRule = forbidOutside({
  description: `no source asserts a type to ${browserValueType}, never or any, but ${brandHome.fn} in ${brandHome.file}`,
  homes: () => [brandHome],
  find: (library, node) => {
    const asserted = assertedType(library.compiled, node);
    return (
      asserted !== undefined &&
      (asserted.never ||
        asserted.any ||
        asserted.aliases.includes(browserValueType) ||
        asserted.brands.includes(browserValueType))
    );
  },
  advice: `a value becomes a ${browserValueType} only through ${brandHome.fn} in ${brandHome.file}, and nothing is asserted to never or any. Build the value on the helpers there.`,
});
