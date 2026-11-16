import { type Dirent, globSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { manifestAt, repositoryRoot } from "../../scripts/repository";

export { workspaceFile } from "../../scripts/pnpm-settings";
export {
  type ExportTarget,
  type Manifest,
  installedVersions,
  installedVp,
  packageManagerAnswerTimeout,
  repositoryRoot,
  rootManifest,
} from "../../scripts/repository";

export const primitivesDirectory = join(repositoryRoot, "packages/primitives");

const generatedOrInstalled = new Set(["node_modules", "dist", ".git"]);
const peerDependencyThatMarksALibrary = "solid-js";

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
  manifest: manifestAt(path),
}));

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
