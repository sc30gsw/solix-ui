import { existsSync, globSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, sep } from "node:path";
import { insideOf, subpathPrefix } from "#/scripts/dist-specifiers.ts";
import { manifestPaths, repositoryRoot, scriptFilesIn } from "#/scripts/repository.ts";
import {
  descendants,
  fileOf,
  moduleSpecifierOf,
  openProgram,
  symbolOf,
  ts,
} from "#/scripts/syntax.ts";

export const subpathImports: Readonly<Record<string, string>> = { [`${subpathPrefix}*`]: "./*" };

const projectSkillScripts = ".agents/skills/*/scripts/**/*.{ts,tsx,mjs,cjs,js}";
const keyThatPrecedesImports = "type";

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

export function packageRootOf(file: string): string {
  const directory = dirname(file);
  if (existsSync(join(directory, "package.json"))) return directory;
  if (dirname(directory) === directory)
    throw new Error(`${file}: no package.json holds this file.`);
  return packageRootOf(directory);
}

export function subpathSpecifierOf(importer: string, target: string): string | undefined {
  const root = packageRootOf(importer);
  return insideOf(root, target)
    ? `${subpathPrefix}${relative(root, target).split(sep).join("/")}`
    : undefined;
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
            statement: node.getText().split("\n")[0],
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

function namesAPackage(specifier: string): boolean {
  return !/^(?:\.{1,2}\/|\/|#)/.test(specifier) && !URL.canParse(specifier);
}

function isRepositoryFile(file: string, root: string): boolean {
  return insideOf(root, file) && !relative(root, file).split(sep).includes("node_modules");
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
      !isRepositoryFile(reference.reached, realRoot)
    ) {
      return [];
    }
    const wanted = subpathSpecifierOf(reference.file, reference.reached);
    return wanted === undefined || wanted === reference.specifier ? [] : [{ ...reference, wanted }];
  });
}

function withSubpathImports(manifest: Manifest): Manifest {
  const imports = { ...manifest.imports, ...subpathImports };
  if (JSON.stringify(manifest.imports) === JSON.stringify(imports)) return manifest;
  const entries = Object.entries(manifest).filter(([key]) => key !== "imports");
  const at = entries.findIndex(([key]) => key === keyThatPrecedesImports) + 1;
  return Object.fromEntries([...entries.slice(0, at), ["imports", imports], ...entries.slice(at)]);
}

function migratedManifests(root: string): string[] {
  return manifestPaths(root).flatMap((path) => {
    const file = join(root, path);
    const manifest = JSON.parse(readFileSync(file, "utf8")) as Manifest;
    const migrated = withSubpathImports(manifest);
    if (migrated === manifest) return [];
    writeFileSync(file, `${JSON.stringify(migrated, null, 2)}\n`);
    return [file];
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

function migratedSources(root: string): string[] {
  const byFile = Map.groupBy(
    misspelt(moduleReferences(filesTheRuleCovers(root)), root),
    ({ file }) => file,
  );
  for (const [file, rewrites] of byFile) {
    writeFileSync(file, rewritten(readFileSync(file, "utf8"), rewrites));
  }
  return [...byFile.keys()];
}

export function migrateToSubpathImports(root: string = repositoryRoot): string[] {
  return [...migratedManifests(root), ...migratedSources(root)];
}
