import { descendants } from "../../../scripts/syntax";
import { browserGlobalsReached } from "./browser-global-reads";
import { at, hasRole, type PrimitiveRule, type Rule, stateCommandRole } from "./library";

const commandKinds: Rule = (library) =>
  library.modules.flatMap((module) =>
    descendants(module.source)
      .filter((node) => hasRole(library, node, [stateCommandRole]))
      .flatMap((body) => {
        const reads = browserGlobalsReached(library, [body]);
        return reads.length === 0
          ? []
          : [
              `${at(module, body)}: ${[...new Set(reads.map((read) => read.text))].join(", ")}: a command whose body reaches a browser-only global must do nothing until an effect has run and never on the server, so make it with createBrowserCommand, not createStateCommand.`,
            ];
      }),
  );

export const commandKindsRule: PrimitiveRule = {
  description:
    "no function typed StateCommandBody reaches a global declared only in lib.dom, through any function it calls",
  rule: commandKinds,
};
