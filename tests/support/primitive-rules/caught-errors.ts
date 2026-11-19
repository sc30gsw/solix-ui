import { join, relative } from "node:path";
import { descendants, ts } from "#/scripts/syntax.ts";
import {
  forbidOutside,
  isInHome,
  type Library,
  type PrimitiveRule,
} from "#/tests/support/primitive-rules/library.ts";
import { type Home, repositoryRoot } from "#/tests/support/workspace.ts";

const boundaryList = "registeredLibraries in tests/support/workspace.ts";

const caughtOutsideBoundaries = forbidOutside({
  description: "nothing catches an error but the functions its library names as error boundaries",
  homes: (library) => library.errorBoundaries,
  find: (_library, node) => ts.isCatchClause(node),
  advice: `nothing in this library catches an error but the error boundaries ${boundaryList} names for it. Let the error reach the caller.`,
});

function holdsACatch(library: Library, home: Home): boolean {
  return library.modules.some((module) =>
    descendants(module.source).some((node) => ts.isCatchClause(node) && isInHome(node, home)),
  );
}

function staleBoundaries(library: Library): string[] {
  return library.errorBoundaries
    .filter((home) => !holdsACatch(library, home))
    .map(
      (home) =>
        `${relative(repositoryRoot, join(library.source, home.file))}: ${boundaryList} names ${home.fn} here as an error boundary, but no catch is there. Name the function that catches, or remove the entry.`,
    );
}

export const caughtErrorsRule: PrimitiveRule = {
  description:
    "nothing catches an error but the functions its library names as error boundaries, and each boundary it names exists and holds a catch",
  rule: (library) => [...caughtOutsideBoundaries.rule(library), ...staleBoundaries(library)],
};
