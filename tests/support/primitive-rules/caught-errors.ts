import { relative } from "node:path";
import { descendants, firstLine, ts } from "#/scripts/syntax.ts";
import { repositoryRoot } from "#/tests/support/workspace.ts";
import {
  at,
  type Home,
  isInHome,
  type PrimitiveRule,
  type Rule,
} from "#/tests/support/primitive-rules/library.ts";

type ErrorBoundaries = { homes: readonly Home[]; advice: string };

const errorBoundaries: Readonly<Record<string, ErrorBoundaries>> = {
  "packages/primitives": {
    homes: [{ file: "internal-browser-value.ts", fn: "whereAllowed" }],
    advice:
      "Find a missing browser API with lookUp or browserMethod, and let any other error reach the caller.",
  },
};

const noBoundary: ErrorBoundaries = { homes: [], advice: "Let the error reach the caller." };

function named(homes: readonly Home[]): string {
  return homes.map(({ file, fn }) => `${fn} in ${file}`).join(" and ") || "no function";
}

const caughtErrors: Rule = (library) => {
  const { homes, advice } =
    errorBoundaries[relative(repositoryRoot, library.directory)] ?? noBoundary;
  return library.modules.flatMap((module) =>
    descendants(module.source)
      .filter((node) => ts.isCatchClause(node) && !homes.some((home) => isInHome(node, home)))
      .map(
        (node) =>
          `${at(module, node)}: ${firstLine(node)}: nothing in this library catches an error but ${named(homes)}. ${advice}`,
      ),
  );
};

export const caughtErrorsRule: PrimitiveRule = {
  description: "nothing catches an error but the functions its library names as error boundaries",
  rule: caughtErrors,
};
