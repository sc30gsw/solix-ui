import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import ts from "typescript";
import { descendants, importsOf, isCallTo } from "../syntax";
import { repositoryRoot } from "../workspace";

export const kebabCaseModule = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.ts$/;
export const typesModule = "types.ts";
export const barrelModule = "index.ts";
export const browserTestSuffixes = [".browser.test.ts", ".browser.test.tsx"];
export const nodeTestSuffixes = [".test.ts", ".test.tsx"];
export const solidModule = "solid-js";

const internalModule = /^internal(?:-[a-z0-9]+)+\.ts$/;
const defaultLibraryFile = /\/typescript\/lib\/lib\.[^/]+\.d\.ts$/;
const primitivePrefix = "create-";
const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ["lib.esnext.d.ts", "lib.dom.d.ts"],
  types: [],
  strict: true,
  noEmit: true,
  skipLibCheck: true,
};

export type Module = { file: string; path: string; source: ts.SourceFile };

export type ModuleLevelFunction = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;

export type Library = {
  source: string;
  testDirectory: string;
  entries: string[];
  modules: Module[];
  tests: Map<string, ts.SourceFile>;
  checker: ts.TypeChecker;
};

export type Rule = (library: Library) => string[];

export type PrimitiveRule = { description: string; rule: Rule };

function entriesOf(directory: string): string[] {
  return existsSync(directory) ? readdirSync(directory).sort() : [];
}

export function loadLibrary(directory: string): Library {
  const source = join(directory, "src");
  const testDirectory = join(directory, "tests");
  const entries = entriesOf(source);
  const paths = entries
    .filter((entry) => entry.endsWith(".ts"))
    .map((entry) => join(source, entry));
  const program = ts.createProgram(paths, compilerOptions);
  const tests = new Map(
    entriesOf(testDirectory)
      .filter((entry) => /\.tsx?$/.test(entry))
      .map((entry): [string, ts.SourceFile] => [
        entry,
        ts.createSourceFile(
          entry,
          readFileSync(join(testDirectory, entry), "utf8"),
          ts.ScriptTarget.Latest,
          true,
          entry.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
        ),
      ]),
  );
  const modules = paths.flatMap((path) => {
    const parsed = program.getSourceFile(path);
    return parsed ? [{ file: basename(path), path, source: parsed }] : [];
  });
  return { source, testDirectory, entries, modules, tests, checker: program.getTypeChecker() };
}

export function at(module: Module, node?: ts.Node): string {
  const file = relative(repositoryRoot, module.path);
  if (!node) return file;
  return `${file}:${module.source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
}

export function testAt(
  library: Library,
  file: string,
  source: ts.SourceFile,
  node?: ts.Node,
): string {
  const path = relative(repositoryRoot, join(library.testDirectory, file));
  if (!node) return path;
  return `${path}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
}

export function isInternal(file: string): boolean {
  return internalModule.test(file);
}

export function isPublic(file: string): boolean {
  return (
    kebabCaseModule.test(file) && !isInternal(file) && file !== typesModule && file !== barrelModule
  );
}

export function isPrimitive(file: string): boolean {
  return isPublic(file) && file.startsWith(primitivePrefix);
}

export function functionNameFor(file: string): string {
  return basename(file, ".ts").replace(/-([a-z0-9])/g, (_match, letter: string) =>
    letter.toUpperCase(),
  );
}

export function publicModules(library: Library): Module[] {
  return library.modules.filter(({ file }) => isPublic(file));
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

export function exportedFunction(module: Module): ts.FunctionDeclaration | undefined {
  const name = functionNameFor(module.file);
  return module.source.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );
}

export function callsOneOf(module: Module, names: readonly string[]): boolean {
  return descendants(module.source).some((node) => names.some((name) => isCallTo(node, name)));
}

export function declaresFunction(module: Module, name: string): boolean {
  return module.source.statements.some(
    (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );
}

export function reachesThrough(
  library: Library,
  module: Module,
  isLeaf: (found: Module) => boolean,
  seen: ReadonlySet<string> = new Set(),
): boolean {
  if (isLeaf(module)) return true;
  return importsOf(module.source)
    .filter(({ typeOnly, specifier }) => !typeOnly && specifier.startsWith("./"))
    .some(({ specifier }) => {
      const target = library.modules.find(({ file }) => `./${basename(file, ".ts")}` === specifier);
      return (
        target !== undefined &&
        !seen.has(target.file) &&
        reachesThrough(library, target, isLeaf, new Set([...seen, module.file]))
      );
    });
}

function isAlias(type: ts.Type, name: string): boolean {
  return type.aliasSymbol?.getName() === name;
}

export function returnsAlias(library: Library, fn: ts.FunctionDeclaration, alias: string): boolean {
  const signature = library.checker.getSignatureFromDeclaration(fn);
  if (!signature) return false;
  const returned = library.checker.getReturnTypeOfSignature(signature);
  return (
    isAlias(returned, alias) ||
    library.checker
      .getPropertiesOfType(returned)
      .some((member) => isAlias(library.checker.getTypeOfSymbol(member), alias))
  );
}

export function stringsIn(library: Library, expression: ts.Expression | undefined): string[] {
  if (!expression) return [];
  const type = library.checker.getTypeAtLocation(expression);
  return (type.isUnion() ? type.types : [type]).flatMap((part) =>
    part.isStringLiteral() ? [part.value] : [],
  );
}

export function isGlobal(library: Library, identifier: ts.Identifier): boolean {
  const symbol = library.checker.getSymbolAtLocation(identifier);
  const declarations = symbol?.getDeclarations() ?? [];
  return (
    declarations.length > 0 &&
    declarations.every((declaration) =>
      defaultLibraryFile.test(declaration.getSourceFile().fileName),
    )
  );
}
