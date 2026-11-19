import { join, relative } from "node:path";
import { descendants, firstLine, ts } from "#/scripts/syntax.ts";
import {
  at,
  isInHome,
  type Library,
  type PrimitiveRule,
} from "#/tests/support/primitive-rules/library.ts";
import { libraryList, repositoryRoot } from "#/tests/support/workspace.ts";

function caughtErrors(library: Library): string[] {
  const catches = library.modules.flatMap((module) =>
    descendants(module.source)
      .filter(ts.isCatchClause)
      .map((clause) => ({ module, clause })),
  );
  return [
    ...catches
      .filter(({ clause }) => !library.errorBoundaries.some((home) => isInHome(clause, home)))
      .map(
        ({ module, clause }) =>
          `${at(module, clause)}: ${firstLine(clause)}: nothing in this library catches an error but the error boundaries ${libraryList} names for it. Let the error reach the caller.`,
      ),
    ...library.errorBoundaries
      .filter((home) => !catches.some(({ clause }) => isInHome(clause, home)))
      .map(
        (home) =>
          `${relative(repositoryRoot, join(library.source, home.file))}: ${libraryList} names ${home.fn} here as an error boundary, but no catch is there. Name the function that catches, or remove the entry.`,
      ),
  ];
}

export const caughtErrorsRule: PrimitiveRule = {
  description:
    "nothing catches an error but the functions its library names as error boundaries, and each boundary it names exists and holds a catch",
  rule: caughtErrors,
};
