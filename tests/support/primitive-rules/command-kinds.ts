import { browserGlobalReadsReachedFrom, stateCommandBodies } from "./browser-global-reads";
import { at, type PrimitiveRule, type Rule } from "./library";

const commandKinds: Rule = (library) =>
  library.modules.flatMap((module) =>
    [...stateCommandBodies(module)].flatMap((body) => {
      const reads = browserGlobalReadsReachedFrom(library, module, body);
      return reads.length === 0
        ? []
        : [
            `${at(module, body)}: ${reads.map((read) => read.text).join(", ")}: a command whose body reaches a browser-only global does nothing on the server, so make it with createBrowserCommand, not createStateCommand.`,
          ];
    }),
  );

export const commandKindsRule: PrimitiveRule = {
  description:
    "a command whose body reaches a browser-only global is made with createBrowserCommand, not createStateCommand",
  rule: commandKinds,
};
