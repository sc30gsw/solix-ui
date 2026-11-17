import {
  declarationsOf,
  isBrowserOnlyGlobal,
  isGlobalObject,
  nameOf,
  ts,
  unwrapped,
} from "#/scripts/syntax.ts";
import { forbidOutside } from "#/tests/support/primitive-rules/library.ts";

const serverFlag = "isServer";
const serverEnvironment = "import.meta.env.SSR";

export const serverBranchesRule = forbidOutside({
  description:
    "no source asks where it runs: no isServer, no typeof of a browser-only global, no globalThis and no import.meta.env.SSR",
  find: (library, node) =>
    isGlobalObject(library.compiled, node) ||
    (ts.isIdentifier(node) &&
      !ts.isImportSpecifier(node.parent) &&
      declarationsOf(library.compiled, node).some(
        (declaration) => nameOf(declaration) === serverFlag,
      )) ||
    (ts.isTypeOfExpression(node) &&
      isBrowserOnlyGlobal(library.compiled, unwrapped(node.expression))) ||
    (ts.isPropertyAccessExpression(node) && node.getText() === serverEnvironment),
  advice:
    "a primitive creates the same reactive nodes on the server and in the browser, so it never asks where it runs. Read a browser-only global only inside a function whose role is browser-only, which the server never runs.",
});
