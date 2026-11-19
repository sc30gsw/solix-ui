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

export type ErrorBoundary = { file: string; fn: string };

export type LibraryRegistration = {
  kind: LibraryKind;
  errorBoundaries: readonly ErrorBoundary[];
};

export const registeredLibraries: Readonly<Record<string, LibraryRegistration>> = {
  "packages/primitives": {
    kind: "primitives",
    errorBoundaries: [{ file: "internal-browser-value.ts", fn: "whereAllowed" }],
  },
  "packages/core": { kind: "components", errorBoundaries: [] },
  "packages/form": {
    kind: "logic",
    errorBoundaries: [
      { file: "internal-validate.ts", fn: "runRule" },
      { file: "is-json-string.ts", fn: "isJSONString" },
    ],
  },
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
  .filter((directory) => inTheLibraryHome.test(directory) && !(directory in registeredLibraries));

export const listedButAbsent = Object.keys(registeredLibraries).filter(
  (directory) => !packages.some(({ path }) => dirname(path) === directory),
);

export const libraryPackages = packages.flatMap((found) => {
  const registration = registeredLibraries[dirname(found.path)];
  return registration === undefined ? [] : [{ ...found, ...registration }];
});

function librariesOfKind(kind: LibraryKind): typeof libraryPackages {
  return libraryPackages.filter((library) => library.kind === kind);
}

function thePrimitivesPackage(): (typeof libraryPackages)[number] {
  const [found, ...others] = librariesOfKind("primitives");
  if (!found?.manifest.name || others.length > 0) {
    throw new Error(
      `tests/support/workspace.ts: list exactly one library of the primitives kind, with a name, in registeredLibraries.`,
    );
  }
  return found;
}

export const primitivesPackage = thePrimitivesPackage();

export const componentLibraries = librariesOfKind("components");

export const libraryNames = libraryPackages.flatMap(({ manifest }) =>
  manifest.name === undefined ? [] : [manifest.name],
);

export const workflowFiles = globSync(".github/workflows/*.{yml,yaml}", { cwd: repositoryRoot });
