import { globSync, readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { allowedRuntimeDependencies } from "#/scripts/runtime-dependencies.ts";
import { calledDeclaration, fileOf, openProgram, ts } from "#/scripts/syntax.ts";
import { componentLibraries, repositoryRoot } from "#/tests/support/workspace.ts";

export const componentFile = /^[A-Z][A-Za-z0-9]*\.tsx$/;
export const stylesVariable = "styles";
export const partsHelper = "createParts";
export const partsHelperFile = "packages/core/src/parts.ts";
export const variablesDefiner = "defineVariables";
export const partsModule = "parts.ts";
export const stylePropTableFile = "packages/core/src/style-prop-table.ts";

export const libraries = componentLibraries.map(({ directory, manifest }) => ({
  name: manifest.name ?? directory,
  directory,
  source: join(directory, "src"),
}));

export type Component = { name: string; file: string; source: ts.SourceFile };

export function relativePath(file: string): string {
  return relative(repositoryRoot, file);
}

export const librarySourceFiles = libraries.flatMap(({ source }) =>
  globSync("**/*.{ts,tsx}", { cwd: source }).map((entry) => join(source, entry)),
);
export const librarySources = openProgram(librarySourceFiles);

export function typedSource(file: string): ts.SourceFile {
  const source = librarySources.sourceFile(file);
  if (!source) throw new Error(`${relativePath(file)}: TypeScript could not read this file.`);
  return source;
}

export const components: Component[] = libraries.flatMap(({ source }) =>
  readdirSync(source)
    .filter((entry) => componentFile.test(entry))
    .sort()
    .map((entry) => ({
      name: basename(entry, ".tsx"),
      file: join(source, entry),
      source: typedSource(join(source, entry)),
    })),
);

export function lineOf(node: ts.Node): number {
  return node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1;
}

export function variablesFileOf(name: string): string {
  return `${name}.variables.ts`;
}

export function definedVariablesOf(declaration: ts.Node | undefined): string | undefined {
  if (
    !declaration ||
    !ts.isVariableDeclaration(declaration) ||
    !isConst(declaration) ||
    !declaration.initializer ||
    !ts.isCallExpression(declaration.initializer)
  ) {
    return undefined;
  }
  const called = calledDeclaration(librarySources, declaration.initializer);
  const [component, ...others] = declaration.initializer.arguments;
  return called &&
    ts.isFunctionDeclaration(called) &&
    called.name?.text === variablesDefiner &&
    relativePath(fileOf(called)) === stylePropTableFile &&
    component &&
    ts.isStringLiteral(component) &&
    others.length === 1
    ? component.text
    : undefined;
}

export function isConst(declaration: ts.VariableDeclaration): boolean {
  return (
    ts.isVariableDeclarationList(declaration.parent) &&
    (declaration.parent.flags & ts.NodeFlags.Const) !== 0
  );
}

export const libraryStyleModule = "packages/core/src/library-style.tsx";

export const importedThroughASeam = allowedRuntimeDependencies();

export const seams = [...new Set(importedThroughASeam.map(({ seam }) => seam))];

export function unwrapped(node: ts.Expression): ts.Expression {
  return ts.isParenthesizedExpression(node) ? unwrapped(node.expression) : node;
}
