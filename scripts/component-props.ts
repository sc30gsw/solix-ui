import { globSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repositoryRoot } from "#/scripts/repository.ts";
import {
  aliasDeclarationsOfTypeAt,
  aliasDeclarationsReturnedBy,
  brandedValuesAt,
  calledDeclaration,
  type ComponentProp,
  declarationsOfSymbol,
  descendants,
  fileOf,
  findAncestor,
  hasCallSignature,
  isPackageFile,
  openProgram,
  type Program,
  propsOfComponent,
  rereadFiles,
  staticPropertyName,
  symbolOf,
  ts,
  virtualFile,
} from "#/scripts/syntax.ts";

export type {
  ComponentProp,
  Control,
  MemberKind,
  NoOp,
  Option,
  Substitute,
} from "#/scripts/syntax.ts";

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
const librarySourcePattern = "**/*.{ts,tsx}";
const jsxElementSource = "export const jsxElement = <></>;\n";
const row = { property: "property", kind: "kind", scale: "scale", aliasOf: "aliasOf" } as const;
const lengthRow = "length";
const withDefaultsName = "withDefaults";
const defaultsTypeName = "Defaults";
const brandMembers = { props: "props", values: "values" } as const;

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

function implementationsOf(program: Program, name: ts.Identifier): ts.Node[] {
  return declarationsOfSymbol(symbolOf(program, name)).filter(
    (declaration) => ts.isFunctionDeclaration(declaration) && declaration.body !== undefined,
  );
}

function isParameter(program: Program, expression: ts.Expression | undefined, of: ts.Node) {
  return (
    expression !== undefined &&
    ts.isIdentifier(expression) &&
    declarationsOfSymbol(symbolOf(program, expression)).includes(of)
  );
}

export type GivenDefaults = {
  readonly call: ts.CallExpression;
  readonly values: ReadonlyMap<ts.Node, string>;
  readonly problems: readonly string[];
};

export function isWithDefaults(program: Program, call: ts.CallExpression): boolean {
  const called = calledDeclaration(program, call);
  return (
    called !== undefined &&
    ts.isFunctionDeclaration(called) &&
    called.name?.text === withDefaultsName &&
    fileOf(called) === sharedPropTypes
  );
}

function isTheDefaultsBrand(declaration: ts.Node): boolean {
  const owner = findAncestor(declaration, ts.isTypeAliasDeclaration);
  return owner?.name.text === defaultsTypeName && fileOf(owner) === sharedPropTypes;
}

export function defaultsBrandAt(program: Program, node: ts.Node) {
  return brandedValuesAt(program, node, isTheDefaultsBrand, brandMembers);
}

export function defaultsAt(program: Program, call: ts.CallExpression): GivenDefaults {
  const [given] = call.arguments;
  const branded = given && defaultsBrandAt(program, given);
  if (branded === undefined) {
    return {
      call,
      values: new Map(),
      problems: [
        "its first argument is not a Defaults that defaultsOf made, so the controls cannot read its defaults. Give it `defaultsOf<Props>()({ … })`.",
      ],
    };
  }
  const values = new Map<ts.Node, string>();
  const problems: string[] = [];
  for (const { name, literal, declarations } of branded) {
    if (literal === undefined || declarations.length === 0) {
      problems.push(
        `it gives ${name} a default that is not one literal of a prop of the props type its Defaults is for, so the controls cannot show it.`,
      );
      continue;
    }
    for (const declaration of declarations) values.set(declaration, literal);
  }
  return { call, values, problems };
}

export function defaultsGivenIn(
  program: Program,
  fn: ts.FunctionDeclaration,
  follow = true,
): GivenDefaults[] {
  const [first] = fn.parameters;
  if (first === undefined || fn.body === undefined) return [];
  return descendants(fn.body).flatMap((node) => {
    if (!ts.isCallExpression(node)) return [];
    const [given, props] = node.arguments;
    if (isWithDefaults(program, node)) {
      return isParameter(program, props, first) ? [defaultsAt(program, node)] : [];
    }
    const called = calledDeclaration(program, node);
    return follow &&
      isParameter(program, given, first) &&
      called !== undefined &&
      ts.isFunctionDeclaration(called) &&
      !isPackageFile(called.getSourceFile().fileName)
      ? defaultsGivenIn(program, called, false)
      : [];
  });
}

function defaultsGivenBy(program: Program, component: ts.Identifier): Map<ts.Node, string> {
  const given = implementationsOf(program, component).flatMap((fn) =>
    ts.isFunctionDeclaration(fn) ? defaultsGivenIn(program, fn) : [],
  );
  const defaults = new Map<ts.Node, string>();
  for (const { call, values } of given) {
    for (const [declaration, value] of values) {
      const earlier = defaults.get(declaration);
      if (earlier !== undefined && earlier !== value) {
        throw new Error(
          `${component.text}: it merges two defaults that give one prop ${earlier} and ${value}, the second in ${relative(repositoryRoot, fileOf(call))}. Give the prop one default.`,
        );
      }
      defaults.set(declaration, value);
    }
  }
  return defaults;
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
  return exportsReturningAJsxElement(program, elementFile, entry).map((name) => ({
    name: name.text,
    declarations: declarationsOfSymbol(symbolOf(program, name)),
    props: propsOfComponent(program, name, {
      describe: rowDescription,
      defaults: defaultsGivenBy(program, name),
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
