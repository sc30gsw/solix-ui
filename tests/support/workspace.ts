import { type Dirent, globSync, readFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { pnpmSettings } from "../../scripts/pnpm-settings";

export const repositoryRoot = join(import.meta.dirname, "../..");
export const primitivesDirectory = join(repositoryRoot, "packages/primitives");

export { workspaceFile } from "../../scripts/pnpm-settings";

const generatedOrInstalled = new Set(["node_modules", "dist", ".git"]);
const peerDependencyThatMarksALibrary = "solid-js";

export type Manifest = {
  name?: string;
  license?: string;
  engines?: Record<string, string>;
  packageManager?: string;
  devEngines?: Record<string, unknown>;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

export function outsideGeneratedOrInstalled(entry: string | Dirent): boolean {
  return (typeof entry === "string" ? entry : entry.name)
    .split(sep)
    .some((segment) => generatedOrInstalled.has(segment));
}

export const packages = globSync("**/package.json", {
  cwd: repositoryRoot,
  exclude: outsideGeneratedOrInstalled,
}).map((path) => ({
  path,
  directory: join(repositoryRoot, dirname(path)),
  manifest: JSON.parse(readFileSync(join(repositoryRoot, path), "utf8")) as Manifest,
}));

export const rootManifest = JSON.parse(
  readFileSync(join(repositoryRoot, "package.json"), "utf8"),
) as Manifest;

export const libraryPackages = packages.filter(
  ({ manifest }) => peerDependencyThatMarksALibrary in (manifest.peerDependencies ?? {}),
);

function thePrimitivesPackage(): (typeof libraryPackages)[number] {
  const found = libraryPackages.find(({ directory }) => directory === primitivesDirectory);
  if (!found?.manifest.name) {
    throw new Error(`${primitivesDirectory}: no library package with a name was found there.`);
  }
  return found;
}

export const primitivesPackage = thePrimitivesPackage();

export const componentLibraries = libraryPackages.filter(
  ({ directory }) => directory !== primitivesDirectory,
);

export const libraryNames = libraryPackages.flatMap(({ manifest }) =>
  manifest.name === undefined ? [] : [manifest.name],
);

export const scriptFiles = globSync("**/*.{ts,tsx,mjs,cjs,js}", {
  cwd: repositoryRoot,
  exclude: outsideGeneratedOrInstalled,
});

export const workflowFiles = globSync(".github/workflows/*.{yml,yaml}", { cwd: repositoryRoot });

export function catalogVersions(): Record<string, string> {
  return pnpmSettings().catalog;
}
