import { globSync } from "node:fs";
import { join } from "node:path";
import {
  declarationsOf,
  findAncestor,
  nameOf,
  openProgram,
  returnedAliasDeclarations,
  ts,
} from "../../../../scripts/syntax.ts";

export const storybookDirectory = join(import.meta.dirname, "../..");

const libraryEntry = join(storybookDirectory, "../../packages/core/src/index.ts");
const jsxNamespace = "JSX";
const jsxElement = "Element";

function isTheJsxElement(declaration: ts.Node): boolean {
  return (
    ts.isTypeAliasDeclaration(declaration) &&
    declaration.name.text === jsxElement &&
    findAncestor(
      declaration,
      (ancestor) =>
        ancestor.kind === ts.SyntaxKind.ModuleDeclaration && nameOf(ancestor) === jsxNamespace,
    ) !== undefined
  );
}

export function exportsThatRender(): string[] {
  const program = openProgram([libraryEntry]);
  try {
    const source = program.sourceFile(libraryEntry);
    if (!source) throw new Error(`${libraryEntry}: TypeScript could not read the library's entry.`);
    return source.statements.flatMap((statement) =>
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
        ? statement.exportClause.elements.flatMap((element) =>
            !element.isTypeOnly &&
            declarationsOf(program, element.name).some((declaration) =>
              returnedAliasDeclarations(program, declaration).some(isTheJsxElement),
            )
              ? [element.name.text]
              : [],
          )
        : [],
    );
  } finally {
    program.dispose();
  }
}

export const storyFiles = globSync("src/**/*.stories.tsx", { cwd: storybookDirectory }).map(
  (file) => join(storybookDirectory, file),
);
