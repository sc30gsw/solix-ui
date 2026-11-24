import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { Plugin, ViteDevServer } from "vite-plus";
import { compiledSourcesOf, libraryLayout, type SourceLayout } from "#/scripts/dist-specifiers.ts";
import { repositoryRoot } from "#/scripts/repository.ts";
import { insideOf, isRelative, posix, subpathPrefix } from "#/scripts/subpath.ts";

export type BuildRecipe = {
  readonly layout: SourceLayout;
  readonly buildScript: string;
};

type Recorded = {
  readonly outputExtensions: Readonly<Record<string, string>>;
  readonly buildScript: string;
  readonly digest: string;
};

export const sourceDigestFile = "source-digest.json";
export const rebuildCommand = "vp run -r build";
export const staleBuild = /was built from other sources than it holds now/;
export const consumedLibraries: readonly string[] = [
  join(repositoryRoot, "packages/core"),
  join(repositoryRoot, "packages/primitives"),
];

const moduleSpecifier = /(?:\bimport\s*\(\s*|\bfrom\s*|\bimport\s+)(["'])([^"']+)\1/g;

function shown(path: string): string {
  return insideOf(repositoryRoot, path) ? posix(relative(repositoryRoot, path)) : path;
}

function nearestManifest(directory: string): string {
  const manifest = join(directory, "package.json");
  if (existsSync(manifest)) return manifest;
  if (dirname(directory) === directory) {
    throw new Error(`${directory}: no package.json holds this directory.`);
  }
  return nearestManifest(dirname(directory));
}

function resolvedFile(specifier: string, importer: string): string | undefined {
  if (isRelative(specifier)) return join(dirname(importer), specifier);
  if (!specifier.startsWith(subpathPrefix)) return undefined;
  return join(dirname(nearestManifest(dirname(importer))), specifier.slice(subpathPrefix.length));
}

export function buildInputsOf(buildScript: string): string[] {
  const seen = new Set<string>();
  const visit = (file: string): void => {
    if (seen.has(file)) return;
    if (!existsSync(file)) {
      throw new Error(`${shown(file)}: the build imports it, but it does not exist.`);
    }
    seen.add(file);
    for (const [, , specifier] of readFileSync(file, "utf8").matchAll(moduleSpecifier)) {
      const target = resolvedFile(specifier, file);
      if (target !== undefined) visit(target);
    }
  };
  visit(buildScript);
  return [...seen].sort();
}

function installedVersionsOf(packageRoot: string): string[] {
  const manifest: { dependencies?: object; devDependencies?: object } = JSON.parse(
    readFileSync(join(packageRoot, "package.json"), "utf8"),
  );
  const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).sort();
  return names.map((name) => {
    const installed = join(packageRoot, "node_modules", name, "package.json");
    if (!existsSync(installed)) return `${name} not installed`;
    const { version }: { version?: unknown } = JSON.parse(readFileSync(installed, "utf8"));
    return `${name}@${String(version)}`;
  });
}

export function digestOf({ layout, buildScript }: BuildRecipe): string {
  const hash = createHash("sha256");
  const add = (label: string, content: string | Buffer) =>
    hash.update(`${label}\0${content.length}\0`).update(content);
  add("extensions", JSON.stringify(layout.outputExtensions));
  for (const name of compiledSourcesOf(layout)) {
    add(`source ${posix(name)}`, readFileSync(join(layout.sourceDirectory, name)));
  }
  for (const file of buildInputsOf(buildScript)) {
    add(`build input ${posix(relative(layout.packageRoot, file))}`, readFileSync(file));
  }
  add("manifest", readFileSync(join(layout.packageRoot, "package.json")));
  add("installed", installedVersionsOf(layout.packageRoot).join("\n"));
  return hash.digest("hex");
}

export async function buildWithASourceDigest(
  recipe: BuildRecipe,
  build: () => Promise<void>,
): Promise<void> {
  const before = digestOf(recipe);
  await build();
  const after = digestOf(recipe);
  if (after !== before) {
    throw new Error(
      `${shown(recipe.layout.packageRoot)}: its sources changed during the build, so dist may hold a mix of both. Run \`${rebuildCommand}\` again.`,
    );
  }
  const recorded: Recorded = {
    outputExtensions: recipe.layout.outputExtensions,
    buildScript: posix(relative(recipe.layout.packageRoot, recipe.buildScript)),
    digest: after,
  };
  writeFileSync(
    join(recipe.layout.outputDirectory, sourceDigestFile),
    `${JSON.stringify(recorded, null, 2)}\n`,
  );
}

function digestFileOf(packageRoot: string): string {
  return join(packageRoot, "dist", sourceDigestFile);
}

export function assertBuiltFromItsSources(packageRoot: string): void {
  const file = digestFileOf(packageRoot);
  const dist = shown(dirname(file));
  if (!existsSync(file)) {
    throw new Error(
      `${dist} holds no ${sourceDigestFile}, so nothing tells which sources it was built from; run \`${rebuildCommand}\`.`,
    );
  }
  const recorded: Recorded = JSON.parse(readFileSync(file, "utf8"));
  const recipe = {
    layout: libraryLayout(packageRoot, recorded.outputExtensions),
    buildScript: join(packageRoot, recorded.buildScript),
  };
  if (digestOf(recipe) !== recorded.digest) {
    throw new Error(
      `${dist} was built from other sources than it holds now: ${shown(packageRoot)}'s sources, its build, its manifest or its installed dependencies changed since. Run \`${rebuildCommand}\`.`,
    );
  }
}

export function builtFromItsSources(packageRoots: readonly string[] = consumedLibraries): Plugin {
  const confirmed = new Set<string>();
  let server: ViteDevServer | undefined;
  let builtByAGlobalSetupLater = false;
  const confirm = (packageRoot: string) => {
    if (confirmed.has(packageRoot)) return;
    assertBuiltFromItsSources(packageRoot);
    confirmed.add(packageRoot);
  };
  const libraryOf = (file: string) =>
    packageRoots.find(
      (root) =>
        insideOf(join(root, "src"), file) ||
        insideOf(join(root, "dist"), file) ||
        file === join(root, "package.json"),
    );
  return {
    name: "solix:built-from-its-sources",
    configureServer(started) {
      server = started;
      started.watcher.add(packageRoots.map((root) => join(root, "src")));
    },
    configResolved(config) {
      builtByAGlobalSetupLater = Reflect.get(config, "test") !== undefined;
    },
    buildStart() {
      for (const root of packageRoots) {
        this.addWatchFile(digestFileOf(root));
        if (!builtByAGlobalSetupLater) confirm(root);
      }
    },
    load(id) {
      const root = libraryOf(id);
      if (root !== undefined && insideOf(join(root, "dist"), id)) confirm(root);
      return undefined;
    },
    watchChange(id) {
      const root = libraryOf(id);
      if (root === undefined) return;
      confirmed.delete(root);
      for (const environment of Object.values(server?.environments ?? {})) {
        for (const served of environment.moduleGraph.idToModuleMap.values()) {
          if (insideOf(join(root, "dist"), served.id ?? "")) {
            environment.moduleGraph.invalidateModule(served);
          }
        }
      }
    },
  };
}
