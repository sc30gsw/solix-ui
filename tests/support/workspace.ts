import { type Dirent, globSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";

export const repositoryRoot = join(import.meta.dirname, "../..");

const generatedOrInstalled = new Set(["node_modules", "dist", ".git"]);
const peerDependencyThatMarksALibrary = "solid-js";

export const componentFile = /^[A-Z][A-Za-z0-9]*\.tsx$/;

export type Manifest = {
  name?: string;
  license?: string;
  engines?: Record<string, string>;
  devEngines?: Record<string, unknown>;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

function outsideGeneratedOrInstalled(entry: string | Dirent): boolean {
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

function holdsComponents(directory: string): boolean {
  return readdirSync(join(directory, "src")).some((entry) => componentFile.test(entry));
}

export const componentLibraries = libraryPackages.filter(({ directory }) =>
  holdsComponents(directory),
);

export const primitiveLibraries = libraryPackages.filter(
  ({ directory }) => !holdsComponents(directory),
);

export const libraryNames = libraryPackages.flatMap(({ manifest }) =>
  manifest.name === undefined ? [] : [manifest.name],
);

export const scriptFiles = globSync("**/*.{ts,tsx,mjs,cjs,js}", {
  cwd: repositoryRoot,
  exclude: outsideGeneratedOrInstalled,
});
