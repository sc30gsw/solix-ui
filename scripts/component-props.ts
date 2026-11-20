import { join } from "node:path";
import { repositoryRoot } from "#/scripts/repository.ts";
import {
  aliasDeclarationsOfTypeAt,
  aliasDeclarationsReturnedBy,
  type ComponentProp,
  openProgram,
  type Program,
  propsOfComponent,
  ts,
  virtualFile,
} from "#/scripts/syntax.ts";

export type { ComponentProp, Control, Option } from "#/scripts/syntax.ts";

export type ComponentProps = Readonly<Record<string, readonly ComponentProp[]>>;

export const libraryEntry = join(repositoryRoot, "packages/core/src/index.ts");

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
): ts.Identifier[] {
  const jsxElementAliases = declaredValues(sourceFileOf(program, elementFile)).flatMap((name) =>
    aliasDeclarationsOfTypeAt(program, name),
  );
  if (jsxElementAliases.length === 0) {
    throw new Error("TypeScript gives no type alias for a JSX element of this project.");
  }
  return namedValueExports(sourceFileOf(program, libraryEntry)).filter((name) =>
    aliasDeclarationsReturnedBy(program, name).some((returned) =>
      jsxElementAliases.includes(returned),
    ),
  );
}

export function openLibraryProgram(): { program: Program; elementFile: string } {
  const elementFile = virtualFile(jsxElementSource, ".tsx");
  return { program: openProgram([libraryEntry, elementFile]), elementFile };
}

let resolved: ComponentProps | undefined;

export function libraryComponentProps(): ComponentProps {
  if (resolved) return resolved;
  const { program, elementFile } = openLibraryProgram();
  try {
    resolved = Object.fromEntries(
      exportsReturningAJsxElement(program, elementFile).map((name) => [
        name.text,
        propsOfComponent(program, name),
      ]),
    );
    return resolved;
  } finally {
    program.dispose();
  }
}
