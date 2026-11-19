import { globSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  type Manifest,
  manifestAt,
  manifestPaths,
  repositoryRoot,
  scriptFilesIn,
  scriptFilesInDotDirectoriesIn,
} from "#/scripts/repository.ts";
import { type TypeCheckedProject } from "#/scripts/syntax.ts";

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

export const libraryKindNames = ["primitives", "components", "logic"] as const;

export type LibraryKind = (typeof libraryKindNames)[number];

export type RuleSet = "every" | "shared" | "none";

export type Home = { file: string; fn?: string };

export type LibraryRegistration = {
  kind: LibraryKind;
  errorBoundaries: readonly Required<Home>[];
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
      { file: "internal-validate.ts", fn: "messageOf" },
      { file: "internal-validate.ts", fn: "runRule" },
      { file: "is-json-string.ts", fn: "isJSONString" },
    ],
  },
};

export const libraryHome = "packages/*";

export const ownLibraryPeerRange = "workspace:^";

export function runtimeVersions(manifest: Manifest): Record<string, string> {
  return { ...manifest.optionalDependencies, ...manifest.dependencies };
}

export function installedDependencies(manifest: Manifest): [string, string][] {
  return Object.entries({ ...runtimeVersions(manifest), ...manifest.devDependencies });
}

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

function thePrimitivesPackageName(): string {
  const [found, ...others] = librariesOfKind("primitives");
  const name = found?.manifest.name;
  if (!name || others.length > 0) {
    throw new Error(
      `tests/support/workspace.ts: list exactly one library of the primitives kind, with a name, in registeredLibraries.`,
    );
  }
  return name;
}

export const primitivesPackageName = thePrimitivesPackageName();

export const componentLibraries = librariesOfKind("components");

const frameworkPeers = ["solid-js", "@solidjs/web", "@stylexjs/stylex"];

export type LibraryKindTraits = {
  what: string;
  project: TypeCheckedProject;
  allowedNames: readonly string[];
  rules: RuleSet;
};

export const libraryKinds: Readonly<Record<LibraryKind, LibraryKindTraits>> = {
  primitives: {
    what: "the primitives package",
    project: "scripts",
    allowedNames: ["solid-js"],
    rules: "every",
  },
  components: {
    what: "a component library",
    project: "scripts",
    allowedNames: [...frameworkPeers, primitivesPackageName],
    rules: "none",
  },
  logic: {
    what: "a logic library",
    project: "withNodeTypes",
    allowedNames: ["solid-js"],
    rules: "shared",
  },
};

export const libraryNames = libraryPackages.flatMap(({ manifest }) =>
  manifest.name === undefined ? [] : [manifest.name],
);

export const workflowFiles = globSync(".github/workflows/*.{yml,yaml}", { cwd: repositoryRoot });
