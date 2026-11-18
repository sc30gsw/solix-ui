import { globSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  manifestAt,
  manifestPaths,
  repositoryRoot,
  scriptFilesIn,
  scriptFilesInDotDirectoriesIn,
} from "#/scripts/repository.ts";

export { workspaceFile } from "#/scripts/pnpm-settings.ts";
export {
  type Dependent,
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
  whyInstalled,
} from "#/scripts/repository.ts";

export type LibraryKind = "primitives" | "components" | "logic";

export const libraryKinds: Readonly<Record<string, LibraryKind>> = {
  "packages/primitives": "primitives",
  "packages/core": "components",
};

export const libraryHome = "packages/*";

const inTheLibraryHome = /^packages\/[^/]+$/;

export const scriptFiles = scriptFilesIn();

export const scriptFilesInDotDirectories = scriptFilesInDotDirectoriesIn();

export const packages = manifestPaths().map((path) => ({
  path,
  directory: join(repositoryRoot, dirname(path)),
  manifest: manifestAt(path),
}));

export const unlistedLibraries = packages
  .map(({ path }) => dirname(path))
  .filter((directory) => inTheLibraryHome.test(directory) && !(directory in libraryKinds));

export const listedButAbsent = Object.keys(libraryKinds).filter(
  (directory) => !packages.some(({ path }) => dirname(path) === directory),
);

export const libraryPackages = packages.flatMap((found) => {
  const kind = libraryKinds[dirname(found.path)];
  return kind === undefined ? [] : [{ ...found, kind }];
});

export function librariesOfKind(kind: LibraryKind): typeof libraryPackages {
  return libraryPackages.filter((library) => library.kind === kind);
}

function thePrimitivesPackage(): (typeof libraryPackages)[number] {
  const [found, ...others] = librariesOfKind("primitives");
  if (!found?.manifest.name || others.length > 0) {
    throw new Error(
      `tests/support/workspace.ts: list exactly one library of the primitives kind, with a name, in libraryKinds.`,
    );
  }
  return found;
}

export const primitivesPackage = thePrimitivesPackage();

export const primitivesDirectory = primitivesPackage.directory;

export const componentLibraries = librariesOfKind("components");

export const libraryNames = libraryPackages.flatMap(({ manifest }) =>
  manifest.name === undefined ? [] : [manifest.name],
);

export const workflowFiles = globSync(".github/workflows/*.{yml,yaml}", { cwd: repositoryRoot });
