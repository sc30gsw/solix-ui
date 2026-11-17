import { globSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, sep } from "node:path";
import { manifestPaths, repositoryRoot, scriptFilesIn } from "#/scripts/repository.ts";
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
  symbolOf,
  ts,
} from "#/scripts/syntax.ts";

const installedPackages = "node_modules";
const projectSkillScripts = ".agents/skills/*/scripts/**/*.{ts,tsx,mjs,cjs,js}";

type Manifest = Record<string, unknown> & { imports?: Record<string, string> };

export type ModuleReference = {
  file: string;
  line: number;
  statement: string;
  specifier: string;
  start: number;
  end: number;
  reached: string | undefined;
};

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
        return [
          {
            file,
            line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            statement: firstLine(node),
            specifier: specifier.text,
            start: specifier.getStart(),
            end: specifier.end,
            reached: declaration
              ? realpathSync(fileOf(declaration))
              : resolvedByNode(file, specifier.text),
          },
        ];
      });
    });
  } finally {
    program.dispose();
  }
}

export function misspelt(
  references: readonly ModuleReference[],
  root: string = repositoryRoot,
): Misspelt[] {
  const realRoot = realpathSync(root);
  return references.flatMap((reference) => {
    if (
      reference.reached === undefined ||
      namesAPackage(reference.specifier) ||
      !insideOf(realRoot, reference.reached) ||
      relative(realRoot, reference.reached).split(sep).includes(installedPackages)
    ) {
      return [];
    }
    const wanted = subpathSpecifierOf(reference.file, reference.reached);
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
  return writes.map(([file]) => file);
}
