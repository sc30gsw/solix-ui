import { ts } from "#/scripts/syntax.ts";
import { forbidOutside } from "#/tests/support/primitive-rules/library.ts";

export const caughtErrorsRule = forbidOutside({
  description: "nothing catches an error but the functions its library names as error boundaries",
  homes: (library) => library.errorBoundaries,
  find: (_library, node) => ts.isCatchClause(node),
  advice:
    "nothing in this library catches an error but the error boundaries registeredLibraries in tests/support/workspace.ts names for it. Let the error reach the caller.",
});
