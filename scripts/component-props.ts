import { globSync } from "node:fs";
import { dirname, join } from "node:path";
import { repositoryRoot } from "#/scripts/repository.ts";
import {
  aliasDeclarationsOfTypeAt,
  aliasDeclarationsReturnedBy,
  type ComponentProp,
  descendants,
  fallbacksIn,
  nameOf,
  openProgram,
  type Program,
  propsOfComponent,
  rereadFiles,
  symbolOf,
  ts,
  virtualFile,
} from "#/scripts/syntax.ts";

export type { ComponentProp, Control, Option } from "#/scripts/syntax.ts";

export type LibraryProp = ComponentProp & {
  readonly common: boolean;
  readonly behaviour: boolean;
};

export type ComponentProps = Readonly<Record<string, readonly LibraryProp[]>>;

export const libraryEntry = join(repositoryRoot, "packages/core/src/index.ts");
const sharedPropTypes = join(repositoryRoot, "packages/core/src/parts.ts");
const commonPropsSource = `import type { JSX } from "@solidjs/web";
import type { ElementProps } from ${JSON.stringify(sharedPropTypes)};

function Common(props: ElementProps<"div", { root: object }>): JSX.Element {
  return <div />;
}

export { Common };
`;
const uncontrolledPrefix = "default";
const colorOptionProp = "color";
const variantProp = "variant";
const colorOptionDefault = "default";

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
  commonFile: string;
} {
  const elementFile = virtualFile(jsxElementSource, ".tsx");
  const commonFile = virtualFile(commonPropsSource, ".tsx");
  return { program: openProgram([entry, elementFile, commonFile]), elementFile, commonFile };
}

function defaultVariantOf(program: Program, component: ts.Identifier): string | undefined {
  const declaration = symbolOf(program, component)?.declarations?.[0]?.resolve();
  if (!declaration) return undefined;
  for (const node of descendants(declaration.getSourceFile())) {
    if (!ts.isPropertyAssignment(node) || nameOf(node) !== colorOptionProp) continue;
    const option = program.checker.getTypeAtLocation(node.initializer);
    const fallback = option && program.checker.getPropertyOfType(option, colorOptionDefault);
    const type = fallback && program.checker.getTypeOfSymbol(fallback);
    if (type?.isStringLiteralType()) return program.checker.typeToString(type);
  }
  return undefined;
}

function controlledPairOf(name: string, names: ReadonlySet<string>): boolean {
  const uncontrolled = `${uncontrolledPrefix}${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  const controlled = name.startsWith(uncontrolledPrefix)
    ? `${name.charAt(uncontrolledPrefix.length).toLowerCase()}${name.slice(uncontrolledPrefix.length + 1)}`
    : undefined;
  return names.has(uncontrolled) || (controlled !== undefined && names.has(controlled));
}

function libraryPropsOf(
  props: readonly ComponentProp[],
  common: ReadonlySet<string>,
  defaultVariant: string | undefined,
): LibraryProp[] {
  const names = new Set(props.map(({ name }) => name));
  const drivesState = (prop: ComponentProp) =>
    prop.control.type === false || controlledPairOf(prop.name, names);
  const stateful = props.some(drivesState);
  return props.map((prop) => ({
    ...prop,
    ...(prop.name === variantProp && defaultVariant !== undefined
      ? { defaultValue: defaultVariant }
      : {}),
    common: prop.declarations.some((key) => common.has(key)),
    behaviour:
      drivesState(prop) || (prop.control.type === "boolean" && (stateful || prop.required)),
  }));
}

export function componentPropsOf(entry: string): ComponentProps {
  const { program, elementFile, commonFile } = openLibraryProgram(entry);
  try {
    const sources = [...new Set([entry, ...sourcesOfTheLibrary(entry)])].flatMap((file) => {
      const source = program.sourceFile(file);
      return source ? [source] : [];
    });
    const fallbacks = fallbacksIn(program, sources);
    const common = new Set(
      exportsReturningAJsxElement(program, elementFile, commonFile).flatMap((name) =>
        propsOfComponent(program, name).flatMap(({ declarations }) => declarations),
      ),
    );
    return Object.fromEntries(
      exportsReturningAJsxElement(program, elementFile, entry).map((name) => [
        name.text,
        libraryPropsOf(
          propsOfComponent(program, name, fallbacks),
          common,
          defaultVariantOf(program, name),
        ),
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
