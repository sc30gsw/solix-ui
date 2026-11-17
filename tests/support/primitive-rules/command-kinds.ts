import { descendants } from "#/scripts/syntax.ts";
import { browserGlobalsReached } from "#/tests/support/primitive-rules/browser-global-reads.ts";
import {
  at,
  hasRole,
  type PrimitiveRule,
  type Rule,
  stateCommandRole,
} from "#/tests/support/primitive-rules/library.ts";

const commandKinds: Rule = (library) =>
  library.modules.flatMap((module) =>
    descendants(module.source)
      .filter((node) => hasRole(library, node, [stateCommandRole]))
      .flatMap((body) => {
        const reads = browserGlobalsReached(library, [body]);
        return reads.length === 0
          ? []
          : [
              `${at(module, body)}: ${[...new Set(reads.map((read) => read.text))].join(", ")}: a command whose body reaches a browser-only global must do nothing on the server, nor while the page hydrates until an effect created after it has run, so make it with createBrowserCommand, not createStateCommand.`,
            ];
      }),
  );

export const commandKindsRule: PrimitiveRule = {
  description:
    "no function typed StateCommandBody reaches a global declared only in lib.dom, through any function, method or accessor it refers to",
  rule: commandKinds,
};
