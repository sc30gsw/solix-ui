import { globSync } from "node:fs";
import { dirname, join } from "node:path";
import { repositoryRoot } from "#/scripts/repository.ts";
import {
  aliasDeclarationsOfTypeAt,
  aliasDeclarationsReturnedBy,
  type ComponentProp,
  openProgram,
  type Program,
  propsOfComponent,
  rereadFiles,
  ts,
  virtualFile,
} from "#/scripts/syntax.ts";

export type { ComponentProp, Control, Option } from "#/scripts/syntax.ts";

export type ComponentProps = Readonly<Record<string, readonly ComponentProp[]>>;

export const libraryEntry = join(repositoryRoot, "packages/core/src/index.ts");

const librarySources = "**/*.{ts,tsx}";
const jsxElementSource = "export const jsxElement = <></>;\n";

function namedValueExports(source: ts.SourceFile): ts.Identifier[] {
  return source.statements.flatMap((statement) =>
    ts.isExportDeclaration(statement) &&
    statement.exportClause &&
    ts.isNamedExports(statement.exportClause)
      ? statement.exportClause.elements.flatMap((element) =>
          element.isTypeOnly || !ts.isIdentifier(element.name) ? [] : [element.name],
        )
      : [],
  );
}

function declaredValues(source: ts.SourceFile): ts.Identifier[] {
  return source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .flatMap(({ name }) => (ts.isIdentifier(name) ? [name] : []));
}

function sourceFileOf(program: Program, file: string): ts.SourceFile {
  const source = program.sourceFile(file);
  if (!source) throw new Error(`${file}: TypeScript could not read this file.`);
  return source;
}

export function exportsReturningAJsxElement(
  program: Program,
  elementFile: string,
  entry: string = libraryEntry,
): ts.Identifier[] {
  const jsxElementAliases = declaredValues(sourceFileOf(program, elementFile)).flatMap((name) =>
    aliasDeclarationsOfTypeAt(program, name),
  );
  if (jsxElementAliases.length === 0) {
    throw new Error("TypeScript gives no type alias for a JSX element of this project.");
  }
  return namedValueExports(sourceFileOf(program, entry)).filter((name) =>
    aliasDeclarationsReturnedBy(program, name).some((returned) =>
      jsxElementAliases.includes(returned),
    ),
  );
}

export function openLibraryProgram(entry: string = libraryEntry): {
  program: Program;
  elementFile: string;
} {
  const elementFile = virtualFile(jsxElementSource, ".tsx");
  return { program: openProgram([entry, elementFile]), elementFile };
}

export function componentPropsOf(entry: string): ComponentProps {
  const { program, elementFile } = openLibraryProgram(entry);
  try {
    return Object.fromEntries(
      exportsReturningAJsxElement(program, elementFile, entry).map((name) => [
        name.text,
        propsOfComponent(program, name),
      ]),
    );
  } finally {
    program.dispose();
  }
}

const resolved = new Map<string, ComponentProps>();

export function libraryComponentProps(entry: string = libraryEntry): ComponentProps {
  const props = resolved.get(entry) ?? componentPropsOf(entry);
  resolved.set(entry, props);
  return props;
}

export function sourcesOfTheLibrary(entry: string = libraryEntry): string[] {
  const directory = dirname(entry);
  return globSync(librarySources, { cwd: directory }).map((file) => join(directory, file));
}

export function forgetComponentProps(changed: readonly string[]): void {
  resolved.clear();
  rereadFiles(changed);
}
