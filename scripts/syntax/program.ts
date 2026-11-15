import { resolve, sep } from "node:path";
import type { Node, SourceFile } from "typescript/unstable/ast";
import { API, type Checker, type CompilerOptions } from "typescript/unstable/sync";

export type Program = {
  sourceFile: (file: string) => SourceFile | undefined;
  checker: Checker;
  dispose: () => void;
};

const sharedSettings = resolve(import.meta.dirname, "../../tsconfig.base.json");
const parseWithoutLibrariesOrImports: CompilerOptions = {
  allowJs: true,
  noLib: true,
  noResolve: true,
};
const virtualFiles = new Map<string, string>();
const parsed = new Map<string, SourceFile>();
let compiler: API | undefined;
let virtualCount = 0;

function normalised(file: string): string {
  return resolve(file).split(sep).join("/");
}

function startedCompiler(): API {
  compiler ??= new API({
    fs: {
      readFile: (file) => virtualFiles.get(normalised(file)),
      fileExists: (file) => (virtualFiles.has(normalised(file)) ? true : undefined),
    },
  });
  return compiler;
}

function virtualPath(name: string): string {
  virtualCount += 1;
  return normalised(resolve(import.meta.dirname, `virtual-${virtualCount}-${name}`));
}

function openProject(
  rootFiles: readonly string[],
  compilerOptions: CompilerOptions,
): { sourceFile: (file: string) => SourceFile | undefined; checker: Checker; dispose: () => void } {
  const config = virtualPath("tsconfig.json");
  virtualFiles.set(
    config,
    JSON.stringify({ extends: sharedSettings, compilerOptions, files: rootFiles }),
  );
  const api = startedCompiler();
  const snapshot = api.updateSnapshot({ openProjects: [config] });
  const project = snapshot.getProject(config);
  if (!project) throw new Error(`${rootFiles.join(", ")}: TypeScript opened no program for these.`);
  return {
    sourceFile: (file) => project.program.getSourceFile(normalised(file)),
    checker: project.checker,
    dispose: () => {
      api.updateSnapshot({ closeProjects: [config] }).dispose();
      snapshot.dispose();
      virtualFiles.delete(config);
    },
  };
}

export function parseAll(files: readonly string[]): SourceFile[] {
  const paths = files.map(normalised);
  const missing = [...new Set(paths.filter((path) => !parsed.has(path)))];
  if (missing.length > 0) {
    const project = openProject(missing, parseWithoutLibrariesOrImports);
    for (const path of missing) {
      const source = project.sourceFile(path);
      if (source) parsed.set(path, source);
    }
    project.dispose();
  }
  return paths.map((path) => {
    const source = parsed.get(path);
    if (!source) throw new Error(`${path}: TypeScript could not read this file.`);
    return source;
  });
}

export function parse(file: string): SourceFile {
  return parseAll([file])[0];
}

export function parseText(text: string, extension: string): SourceFile {
  const file = virtualPath(`source${extension}`);
  virtualFiles.set(file, text);
  return parse(file);
}

export function openProgram(rootFiles: readonly string[]): Program {
  return openProject(rootFiles.map(normalised), {});
}

export function stringLiteralTypesOf(checker: Checker, node: Node): string[] {
  const type = checker.getTypeAtLocation(node);
  if (!type) return [];
  return ((type.isUnionType() ? type.getTypes() : undefined) ?? [type]).flatMap((part) =>
    part.isStringLiteralType() ? [String(part.value)] : [],
  );
}
