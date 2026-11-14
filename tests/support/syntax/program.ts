import { join } from "node:path";
import type { Node, SourceFile } from "typescript/unstable/ast";
import { API, type Checker, type Snapshot } from "typescript/unstable/sync";

export type CompilerOptions = Record<string, unknown>;

export type Program = {
  sourceFile: (file: string) => SourceFile | undefined;
  checker: Checker;
};

const parseOnly: CompilerOptions = {
  allowJs: true,
  jsx: "preserve",
  noEmit: true,
  noLib: true,
  noResolve: true,
  types: [],
};
const virtualFiles = new Map<string, string>();
const parsed = new Map<string, SourceFile>();
const rewritten = new Set<string>();
let compiler: API | undefined;
let projectCount = 0;
let lastParse: { config: string; snapshot: Snapshot } | undefined;

function startedCompiler(): API {
  compiler ??= new API({
    fs: {
      readFile: (file) => virtualFiles.get(file),
      fileExists: (file) => (virtualFiles.has(file) ? true : undefined),
    },
  });
  return compiler;
}

function virtualProject(rootFiles: readonly string[], compilerOptions: CompilerOptions): string {
  projectCount += 1;
  const config = join(import.meta.dirname, `virtual-project-${projectCount}.json`);
  virtualFiles.set(config, JSON.stringify({ compilerOptions, files: rootFiles }));
  return config;
}

export function parseAll(files: readonly string[]): SourceFile[] {
  const missing = [...new Set(files.filter((file) => !parsed.has(file)))];
  if (missing.length > 0) {
    const config = virtualProject(missing, parseOnly);
    const snapshot = startedCompiler().updateSnapshot({
      openProjects: [config],
      closeProjects: lastParse ? [lastParse.config] : [],
      fileChanges: { changed: [...rewritten] },
    });
    rewritten.clear();
    lastParse?.snapshot.dispose();
    lastParse = { config, snapshot };
    const program = snapshot.getProject(config)?.program;
    for (const file of missing) {
      const source = program?.getSourceFile(file);
      if (source) parsed.set(file, source);
    }
  }
  return files.map((file) => {
    const source = parsed.get(file);
    if (!source) throw new Error(`${file}: TypeScript could not read this file.`);
    return source;
  });
}

export function parse(file: string, text?: string): SourceFile {
  if (text !== undefined && virtualFiles.get(file) !== text) {
    if (virtualFiles.has(file)) rewritten.add(file);
    virtualFiles.set(file, text);
    parsed.delete(file);
  }
  return parseAll([file])[0];
}

export function openProgram(
  rootFiles: readonly string[],
  compilerOptions: CompilerOptions,
): Program {
  const config = virtualProject(rootFiles, compilerOptions);
  const project = startedCompiler()
    .updateSnapshot({ openProjects: [config] })
    .getProject(config);
  if (!project) throw new Error(`${rootFiles.join(", ")}: TypeScript opened no program for these.`);
  return { sourceFile: (file) => project.program.getSourceFile(file), checker: project.checker };
}

export function stringLiteralTypesOf(checker: Checker, node: Node): string[] {
  const type = checker.getTypeAtLocation(node);
  if (!type) return [];
  return ((type.isUnionType() ? type.getTypes() : undefined) ?? [type]).flatMap((part) =>
    part.isStringLiteralType() ? [String(part.value)] : [],
  );
}
