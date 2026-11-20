import { globSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, sep } from "node:path";
import {
  type Manifest,
  manifestPaths,
  repositoryRoot,
  scriptFilesIn,
} from "#/scripts/repository.ts";
import {
  insideOf,
  namesAPackage,
  subpathPattern,
  subpathPatternTarget,
  subpathSpecifierOf,
} from "#/scripts/subpath.ts";
import {
  descendants,
  fileOf,
  firstLine,
  moduleSpecifierOf,
  openProgram,
  rereadFiles,
  symbolOf,
  ts,
} from "#/scripts/syntax.ts";

const installedPackages = "node_modules";
const projectSkillScripts = ".agents/skills/*/scripts/**/*.{ts,tsx,mjs,cjs,js}";

export type ModuleReference = {
  file: string;
  line: number;
  statement: string;
  specifier: string;
  start: number;
  end: number;
  reach: ModuleReach;
};

export type ModuleReach =
  | { kind: "file"; path: string }
  | { kind: "ambient" }
  | { kind: "unresolved" };

export type Misspelt = ModuleReference & { wanted: string };

export function filesTheRuleCovers(root: string = repositoryRoot): string[] {
  const projectSkills = globSync(projectSkillScripts, { cwd: root }).filter((file) =>
    insideOf(realpathSync(join(root, ".agents")), realpathSync(join(root, file))),
  );
  return [...scriptFilesIn(root), ...projectSkills].map((file) => realpathSync(join(root, file)));
}

function resolvedByNode(file: string, specifier: string): string | undefined {
  try {
    return realpathSync(createRequire(file).resolve(specifier));
  } catch {
    return undefined;
  }
}

function declaresExactly(declaration: ts.Node, specifier: string): boolean {
  return (
    ts.isModuleDeclaration(declaration) &&
    ts.isStringLiteral(declaration.name) &&
    declaration.name.text === specifier
  );
}

function reachOf(file: string, specifier: string, declaration: ts.Node | undefined): ModuleReach {
  if (declaration !== undefined && declaresExactly(declaration, specifier)) {
    return { kind: "ambient" };
  }
  const path =
    declaration !== undefined && !ts.isModuleDeclaration(declaration)
      ? realpathSync(fileOf(declaration))
      : resolvedByNode(file, specifier);
  return path === undefined ? { kind: "unresolved" } : { kind: "file", path };
}

export function moduleReferences(files: readonly string[]): ModuleReference[] {
  const program = openProgram(files);
  try {
    return files.flatMap((file) => {
      const source = program.sourceFile(file);
      if (!source) throw new Error(`${file}: TypeScript could not read this file.`);
      return descendants(source).flatMap((node): ModuleReference[] => {
        const specifier = moduleSpecifierOf(node);
        if (!specifier || !ts.isStringLiteralLikeNode(specifier)) return [];
        const declaration = symbolOf(program, specifier)?.declarations?.[0]?.resolve();
        const reach = reachOf(file, specifier.text, declaration);
        return [
          {
            file,
            line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            statement: firstLine(node),
            specifier: specifier.text,
            start: specifier.getStart(),
            end: specifier.end,
            reach,
          },
        ];
      });
    });
  } finally {
    program.dispose();
  }
}

export function unresolvedPaths(references: readonly ModuleReference[]): ModuleReference[] {
  return references.filter(
    ({ reach, specifier }) => reach.kind === "unresolved" && !namesAPackage(specifier),
  );
}

export function misspelt(
  references: readonly ModuleReference[],
  root: string = repositoryRoot,
): Misspelt[] {
  const realRoot = realpathSync(root);
  return references.flatMap((reference) => {
    const { reach } = reference;
    if (
      reach.kind !== "file" ||
      namesAPackage(reference.specifier) ||
      !insideOf(realRoot, reach.path) ||
      relative(realRoot, reach.path).split(sep).includes(installedPackages)
    ) {
      return [];
    }
    const wanted = subpathSpecifierOf(reference.file, reach.path);
    return wanted === undefined || wanted === reference.specifier ? [] : [{ ...reference, wanted }];
  });
}

function rewritten(text: string, rewrites: readonly Misspelt[]): string {
  return rewrites
    .toSorted((left, right) => right.start - left.start)
    .reduce(
      (current, { start, end, wanted }) =>
        `${current.slice(0, start)}${current[start]}${wanted}${current[start]}${current.slice(end)}`,
      text,
    );
}

function manifestWrites(root: string): [file: string, text: string][] {
  return manifestPaths(root).flatMap((path): [string, string][] => {
    const file = join(root, path);
    const manifest = JSON.parse(readFileSync(file, "utf8")) as Manifest;
    if (manifest.imports?.[subpathPattern] === subpathPatternTarget) return [];
    const imports = { ...manifest.imports, [subpathPattern]: subpathPatternTarget };
    return [[file, `${JSON.stringify({ ...manifest, imports }, null, 2)}\n`]];
  });
}

function sourceWrites(root: string): [file: string, text: string][] {
  const byFile = Map.groupBy(
    misspelt(moduleReferences(filesTheRuleCovers(root)), root),
    ({ file }) => file,
  );
  return [...byFile].map(([file, rewrites]) => [
    file,
    rewritten(readFileSync(file, "utf8"), rewrites),
  ]);
}

export function migrateToSubpathImports(root: string = repositoryRoot): string[] {
  const writes = [...manifestWrites(root), ...sourceWrites(root)];
  for (const [file, text] of writes) writeFileSync(file, text);
  const written = writes.map(([file]) => file);
  rereadFiles(written);
  return written;
}
