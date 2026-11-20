import { globSync } from "node:fs";
import { dirname, join } from "node:path";
import { repositoryRoot } from "#/scripts/repository.ts";
import {
  aliasDeclarationsOfTypeAt,
  aliasDeclarationsReturnedBy,
  calledDeclaration,
  type ComponentProp,
  declarationsOfSymbol,
  descendants,
  declaredDefaultsIn,
  fallbacksIn,
  hasCallSignature,
  openProgram,
  type Program,
  propsOfComponent,
  rereadFiles,
  staticPropertyName,
  symbolOf,
  ts,
  virtualFile,
} from "#/scripts/syntax.ts";

export type { ComponentProp, Control, MemberKind, Option } from "#/scripts/syntax.ts";

export type LibraryComponent = {
  readonly name: string;
  readonly declarations: readonly ts.Node[];
  readonly props: readonly ComponentProp[];
  readonly staticParts: readonly string[];
  readonly partDeclarations: readonly ts.Node[];
};

export type ComponentProps = Readonly<Record<string, readonly ComponentProp[]>>;

export type StaticParts = Readonly<Record<string, readonly string[]>>;

type Library = { readonly props: ComponentProps; readonly staticParts: StaticParts };

export const libraryEntry = join(repositoryRoot, "packages/core/src/index.ts");
export const sharedPropTypes = join(repositoryRoot, "packages/core/src/parts.ts");
const colorTypes = join(repositoryRoot, "packages/core/src/colors.ts");
const librarySourcePattern = "**/*.{ts,tsx}";
const jsxElementSource = "export const jsxElement = <></>;\n";
const partsFactory = "createParts";
const colorOption = "color";
const colorOptionDefault = "default";
const colorPropsType = "ColorProps";
const variantProp = "variant";
const row = { property: "property", kind: "kind", scale: "scale", aliasOf: "aliasOf" } as const;
const lengthRow = "length";

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

export function librarySources(entry: string = libraryEntry): string[] {
  const directory = dirname(entry);
  const found = globSync(librarySourcePattern, { cwd: directory }).map((file) =>
    join(directory, file),
  );
  return [...new Set([entry, ...found])];
}

export function openLibraryProgram(
  entry: string = libraryEntry,
  files: readonly string[] = [],
): { program: Program; elementFile: string } {
  const elementFile = virtualFile(jsxElementSource, ".tsx");
  return { program: openProgram([entry, elementFile, ...files]), elementFile };
}

function rowField(literal: ts.ObjectLiteralExpression, field: string): string | undefined {
  for (const property of literal.properties) {
    if (!ts.isPropertyAssignment(property) || staticPropertyName(property) !== field) continue;
    return ts.isStringLiteral(property.initializer) ? property.initializer.text : undefined;
  }
  return undefined;
}

function rowDescription(declarations: readonly ts.Node[]): string {
  const [declaration] = declarations;
  if (!declaration || !ts.isPropertyAssignment(declaration)) return "";
  const literal = declaration.initializer;
  if (!ts.isObjectLiteralExpression(literal)) return "";
  const aliasOf = rowField(literal, row.aliasOf);
  if (aliasOf !== undefined) return `The same as \`${aliasOf}\`.`;
  const property = rowField(literal, row.property);
  if (property === undefined) return "";
  const scale = rowField(literal, row.scale);
  const length = rowField(literal, row.kind) === lengthRow;
  const takes = [
    ...(scale === undefined ? [] : [`a key of the \`${scale}\` scale`]),
    ...(length
      ? ["a number of pixels", "any CSS length"]
      : scale === undefined
        ? []
        : ["any value the property takes"]),
  ];
  const listed =
    takes.length > 1 ? `${takes.slice(0, -1).join(", ")} or ${takes.at(-1)}` : takes.join("");
  return takes.length === 0
    ? `Sets the CSS \`${property}\`.`
    : `Sets the CSS \`${property}\`: ${listed}.`;
}

function declarationsOfVariant(program: Program): ts.Node[] {
  const source = program.sourceFile(colorTypes);
  const alias = source?.statements.find(
    (statement) => ts.isTypeAliasDeclaration(statement) && statement.name.text === colorPropsType,
  );
  if (!alias || !ts.isTypeAliasDeclaration(alias) || !ts.isTypeLiteralNode(alias.type)) return [];
  return alias.type.members.filter((member) => staticPropertyName(member) === variantProp);
}

function isPartsFactory(declaration: ts.Node | undefined): boolean {
  return (
    declaration !== undefined &&
    ts.isFunctionDeclaration(declaration) &&
    declaration.name?.text === partsFactory &&
    declaration.getSourceFile().fileName === sharedPropTypes
  );
}

function defaultsOf(program: Program, component: ts.Identifier): Map<ts.Node, string> {
  const implementations = declarationsOfSymbol(symbolOf(program, component)).filter(
    (declaration) => ts.isFunctionDeclaration(declaration) && declaration.body !== undefined,
  );
  for (const call of implementations.flatMap((implementation) => descendants(implementation))) {
    if (!ts.isCallExpression(call) || !isPartsFactory(calledDeclaration(program, call))) continue;
    const options = call.arguments[3];
    if (!options || !ts.isObjectLiteralExpression(options)) continue;
    const color = options.properties.find(
      (property) => staticPropertyName(property) === colorOption,
    );
    const option = color && program.checker.getTypeAtLocation(color);
    const fallback = option && program.checker.getPropertyOfType(option, colorOptionDefault);
    const type = fallback && program.checker.getTypeOfSymbol(fallback);
    if (!type?.isStringLiteralType()) continue;
    const value = program.checker.typeToString(type);
    return new Map(declarationsOfVariant(program).map((declaration) => [declaration, value]));
  }
  return new Map();
}

function staticPartMembers(program: Program, component: ts.Identifier) {
  const symbol = symbolOf(program, component);
  const type = symbol && program.checker.getTypeOfSymbol(symbol);
  if (!type) return [];
  return program.checker
    .getPropertiesOfType(type)
    .filter((member) =>
      declarationsOfSymbol(member).some((declaration) => hasCallSignature(program, declaration)),
    );
}

function partDeclarationsOf(program: Program, component: ts.Identifier): ts.Node[] {
  return staticPartMembers(program, component).flatMap((member) =>
    declarationsOfSymbol(member).flatMap((declaration) => {
      const assigned = ts.isBinaryExpression(declaration) ? declaration.right : undefined;
      const part = assigned && symbolOf(program, assigned);
      return part ? declarationsOfSymbol(part) : [];
    }),
  );
}

export function componentsIn(
  program: Program,
  elementFile: string,
  entry: string = libraryEntry,
): LibraryComponent[] {
  const sources = librarySources(entry).flatMap((file) => program.sourceFile(file) ?? []);
  const fallbacks = fallbacksIn(program, sources);
  const declared = declaredDefaultsIn(program, sources);
  return exportsReturningAJsxElement(program, elementFile, entry).map((name) => ({
    name: name.text,
    declarations: declarationsOfSymbol(symbolOf(program, name)),
    props: propsOfComponent(program, name, {
      fallbacks,
      describe: rowDescription,
      defaults: new Map([...declared, ...defaultsOf(program, name)]),
    }),
    staticParts: staticPartMembers(program, name).map((member) => member.name),
    partDeclarations: partDeclarationsOf(program, name),
  }));
}

function libraryOf(entry: string): Library {
  const { program, elementFile } = openLibraryProgram(entry);
  try {
    const components = componentsIn(program, elementFile, entry);
    return {
      props: Object.fromEntries(components.map(({ name, props }) => [name, props])),
      staticParts: Object.fromEntries(
        components.map(({ name, staticParts }) => [name, staticParts]),
      ),
    };
  } finally {
    program.dispose();
  }
}

export function componentPropsOf(entry: string): ComponentProps {
  return libraryOf(entry).props;
}

const resolved = new Map<string, Library>();

function resolvedLibrary(entry: string): Library {
  const library = resolved.get(entry) ?? libraryOf(entry);
  resolved.set(entry, library);
  return library;
}

export function libraryComponentProps(entry: string = libraryEntry): ComponentProps {
  return resolvedLibrary(entry).props;
}

export function libraryStaticParts(entry: string = libraryEntry): StaticParts {
  return resolvedLibrary(entry).staticParts;
}

export function forgetComponentProps(changed: readonly string[]): void {
  if (resolved.size === 0) return;
  resolved.clear();
  rereadFiles(changed);
}
