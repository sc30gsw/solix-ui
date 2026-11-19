import { existsSync, readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";
import {
  type Alias,
  contextualAliases,
  declarationsOf,
  descendants,
  enclosingFunctionName,
  fileOf,
  firstLine,
  importsOf,
  isDomLibraryFile,
  isPackageFile,
  memberDeclarations,
  nameOf,
  openProgram,
  type Program,
  reachedFrom,
  ts,
} from "#/scripts/syntax.ts";
import {
  type LibraryKind,
  libraryKinds,
  type LibraryRegistration,
  repositoryRoot,
} from "#/tests/support/workspace.ts";

export const kebabCaseModule = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.ts$/;
export const typesModule = "types.ts";
export const constantsModule = "constants.ts";
export const sharedModules: readonly string[] = [constantsModule, typesModule];
export const barrelModule = "index.ts";
export const browserTestSuffixes = [".browser.test.ts", ".browser.test.tsx"];
export const nodeTestSuffixes = [".test.ts", ".test.tsx"];
export const solidModule = "solid-js";

const internalModule = /^internal(?:-[a-z0-9]+)+\.ts$/;
const primitivePrefix = "create-";
const primitivesSource = join(repositoryRoot, "packages/primitives/src");
const solidPackage = /[\\/]node_modules[\\/](?:solid-js|@solidjs[\\/][a-z-]+)[\\/]/;

export const browserOnlyRoles = Object.freeze([
  "Subscription",
  "Attach",
  "BrowserCallback",
  "BrowserCompute",
  "EffectFunction",
] as const);
export const comparedByValueRoles = Object.freeze(["LiveConfig", "BrowserCompute"] as const);
export const stateCommandRole = "StateCommandBody";

export type Module = { file: string; path: string; source: ts.SourceFile };

export type Library = {
  errorBoundaries: readonly Home[];
  source: string;
  testDirectory: string;
  entries: string[];
  modules: Module[];
  tests: Map<string, ts.SourceFile>;
  compiled: Program;
  compiledTests: Program;
  dispose: () => void;
};

export type Rule = (library: Library) => string[];

export type PrimitiveRule = { description: string; rule: Rule };

export type KindRule = PrimitiveRule & { kinds: readonly LibraryKind[] };

export type Home = { file: string; fn?: string };

export type Declared = { file: string; name: string };

function entriesOf(directory: string): string[] {
  return existsSync(directory) ? readdirSync(directory).sort() : [];
}

export function loadLibrary(directory: string, registration: LibraryRegistration): Library {
  const source = join(directory, "src");
  const testDirectory = join(directory, "tests");
  const entries = entriesOf(source);
  const paths = entries
    .filter((entry) => entry.endsWith(".ts"))
    .map((entry) => join(source, entry));
  const compiled = openProgram(paths, libraryKinds[registration.kind].project);
  const testFiles = entriesOf(testDirectory).filter((entry) => /\.tsx?$/.test(entry));
  const compiledTests = openProgram(testFiles.map((entry) => join(testDirectory, entry)));
  const tests = new Map(
    testFiles.flatMap((entry): [string, ts.SourceFile][] => {
      const parsed = compiledTests.sourceFile(join(testDirectory, entry));
      return parsed ? [[entry, parsed]] : [];
    }),
  );
  const modules = paths.flatMap((path) => {
    const parsed = compiled.sourceFile(path);
    return parsed ? [{ file: basename(path), path, source: parsed }] : [];
  });
  return {
    errorBoundaries: registration.errorBoundaries,
    source,
    testDirectory,
    entries,
    modules,
    tests,
    compiled,
    compiledTests,
    dispose: () => {
      compiled.dispose();
      compiledTests.dispose();
    },
  };
}

export function located(node: ts.Node): string {
  const source = node.getSourceFile();
  const file = relative(repositoryRoot, source.fileName);
  return `${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
}

export function at(module: Module, node?: ts.Node): string {
  return node ? located(node) : relative(repositoryRoot, module.path);
}

export function testAt(
  library: Library,
  file: string,
  source: ts.SourceFile,
  node?: ts.Node,
): string {
  return node ? located(node) : relative(repositoryRoot, join(library.testDirectory, file));
}

export function isInternal(file: string): boolean {
  return internalModule.test(file);
}

export function isPublic(file: string): boolean {
  return (
    kebabCaseModule.test(file) &&
    !isInternal(file) &&
    !sharedModules.includes(file) &&
    file !== barrelModule
  );
}

export function isPrimitive(file: string): boolean {
  return isPublic(file) && file.startsWith(primitivePrefix);
}

export function isNamedFor(file: string, name: string): boolean {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
  const withDigitWords = words.replace(/([a-z])([0-9])/g, "$1-$2");
  return [words, withDigitWords].includes(basename(file, ".ts"));
}

export function publicModules(library: Library): Module[] {
  return library.modules.filter(({ file }) => isPublic(file));
}

export function browserTests(library: Library): [string, ts.SourceFile][] {
  return [...library.tests].filter(([file]) =>
    browserTestSuffixes.some((suffix) => file.endsWith(suffix)),
  );
}

export function testNamed(
  library: Library,
  file: string,
  suffixes: string[],
): ts.SourceFile | undefined {
  return suffixes
    .map((suffix) => library.tests.get(`${basename(file, ".ts")}${suffix}`))
    .find((found) => found !== undefined);
}

export function importsFrom(module: Module, specifier: string): boolean {
  return importsOf(module.source).some((found) => found.specifier === specifier);
}

export type ExportedFunction = {
  first: ts.FunctionDeclaration | undefined;
  all: ts.FunctionDeclaration[];
};

export function exportedFunctions(module: Module): ExportedFunction {
  const all = module.source.statements.filter(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      statement.name !== undefined &&
      isNamedFor(module.file, statement.name.text),
  );
  return { first: all[0], all };
}

export function isDeclared(declaration: ts.Node, declared: Declared): boolean {
  return (
    basename(fileOf(declaration)) === declared.file &&
    !isPackageFile(fileOf(declaration)) &&
    nameOf(declaration) === declared.name
  );
}

export function isFromSolid(declaration: ts.Node, names: readonly string[]): boolean {
  return solidPackage.test(fileOf(declaration)) && names.includes(nameOf(declaration));
}

export function refersTo(library: Library, node: ts.Node, declared: Declared): boolean {
  return declarationsOf(library.compiled, node).some((found) => isDeclared(found, declared));
}

export function refersToDomMember(
  library: Library,
  node: ts.Node,
  matches: (declaration: ts.Node) => boolean,
  program: Program = library.compiled,
): boolean {
  return memberDeclarations(program, node).some(
    (declaration) => isDomLibraryFile(fileOf(declaration)) && matches(declaration),
  );
}

export function callsTo(library: Library, node: ts.Node, declared: Declared): boolean {
  return ts.isCallExpression(node) && refersTo(library, calleeName(node.expression), declared);
}

export function calleeName(expression: ts.Expression): ts.Node {
  return ts.isPropertyAccessExpression(expression) ? expression.name : expression;
}

export function reaches(
  library: Library,
  declarations: readonly ts.FunctionDeclaration[],
  declared: Declared,
): boolean {
  return [...reachedFrom(library.compiled, declarations).functions].some((fn) =>
    isDeclared(fn, declared),
  );
}

function isRole(alias: Alias, roles: readonly string[]): boolean {
  return (
    roles.includes(alias.name) &&
    (alias.file.startsWith(primitivesSource) || solidPackage.test(alias.file))
  );
}

function mayTakeARole(node: ts.Node): boolean {
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return true;
  if (!ts.isIdentifier(node)) return false;
  const parent = node.parent;
  return (
    (ts.isCallExpression(parent) && parent.arguments.some((argument) => argument === node)) ||
    (ts.isPropertyAssignment(parent) && parent.initializer === node)
  );
}

export function hasRole(library: Library, node: ts.Node, roles: readonly string[]): boolean {
  return (
    mayTakeARole(node) &&
    contextualAliases(library.compiled, node).some((alias) => isRole(alias, roles))
  );
}

export function isInHome(node: ts.Node, home: Home): boolean {
  if (basename(fileOf(node)) !== home.file) return false;
  return home.fn === undefined || enclosingFunctionName(node) === home.fn;
}

export type Forbidden = {
  description: string;
  find: (library: Library, node: ts.Node) => boolean;
  homes?: (library: Library) => readonly Home[];
  advice: string;
  modules?: (library: Library) => Module[];
};

export function forbidOutside(forbidden: Forbidden): PrimitiveRule {
  return {
    description: forbidden.description,
    rule: (library) =>
      (forbidden.modules?.(library) ?? library.modules).flatMap((module) =>
        descendants(module.source)
          .filter(
            (node) =>
              !(forbidden.homes?.(library) ?? []).some((home) => isInHome(node, home)) &&
              forbidden.find(library, node),
          )
          .map((node) => `${at(module, node)}: ${firstLine(node)}: ${forbidden.advice}`),
      ),
  };
}
