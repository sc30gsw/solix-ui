import { globSync } from "node:fs";
import { dirname, join } from "node:path";
import { manifestAt, manifestPaths, repositoryRoot, scriptFilesIn } from "#/scripts/repository.ts";

export { workspaceFile } from "#/scripts/pnpm-settings.ts";
export {
  type ExportTarget,
  type Installed,
  type Manifest,
  installedVersions,
  installedVp,
  listed,
  outsideGeneratedOrInstalled,
  packageManagerAnswerTimeout,
  repositoryRoot,
  rootManifest,
} from "#/scripts/repository.ts";

export const primitivesDirectory = join(repositoryRoot, "packages/primitives");

const peerDependencyThatMarksALibrary = "solid-js";

export const scriptFiles = scriptFilesIn();

export const packages = manifestPaths().map((path) => ({
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

export const workflowFiles = globSync(".github/workflows/*.{yml,yaml}", { cwd: repositoryRoot });
