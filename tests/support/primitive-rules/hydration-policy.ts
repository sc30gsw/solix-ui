import { declarationsOf, ts } from "../syntax";
import { forbidOutside, isFromSolid } from "./library";

const policyModule = "internal-browser-value.ts";
const hydrationNames = ["ssrSource", "from"];

export const hydrationPolicyRule = forbidOutside({
  description: `only ${policyModule} refers to Solid's ssrSource option or its from`,
  home: { file: policyModule },
  find: (library, node) =>
    (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isComputedPropertyName(node)) &&
    !ts.isImportSpecifier(node.parent) &&
    declarationsOf(library.compiled, node).some((declaration) =>
      isFromSolid(declaration, hydrationNames),
    ),
  advice: `only ${policyModule} decides what the server and hydration read. Build the value on createBrowserValue, or a browser-only memo on createBrowserMemo.`,
});
