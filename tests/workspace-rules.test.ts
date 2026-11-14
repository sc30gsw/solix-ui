import { existsSync, globSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import semver from "semver";
import ts from "typescript";
import { expect, test } from "vite-plus/test";
import {
  type Manifest,
  libraryPackages,
  packages,
  repositoryRoot,
  rootManifest,
  scriptFiles,
} from "./support/workspace";

const vitePlusCommandFor: Record<string, string> = {
  vitest: "vp test",
  jest: "vp test",
  eslint: "vp check",
  prettier: "vp check",
  oxlint: "vp check",
  oxfmt: "vp check",
  tsx: "vpx <file>",
  "ts-node": "vpx <file>",
  tsdown: "vp pack",
  tsup: "vp pack",
};

const projectLicence = "MIT";
const peerDependenciesALibraryMayHave = ["solid-js", "@solidjs/web", "@stylexjs/stylex"];
const webStandardsOnly =
  "The library is built on web standards only and has no runtime dependency. Use a platform feature or a fallback written in this repository.";

const workspaceFile = "pnpm-workspace.yaml";
const catalogBlock = /^catalog:\n((?:[ \t]+.*\n?)+)/m;
const catalogEntry = /^\s+("?)([^":\s]+)\1:\s*"?([^"\s]+)"?\s*$/;

const nodeVersionHome = "package.json";
const nodeVersionFilesThatCompete = [".node-version", ".nvmrc"];
const workflowFiles = globSync(".github/workflows/*.yml", { cwd: repositoryRoot });
const setupVpStep = /^( *)- uses: voidzero-dev\/setup-vp@\S+\n((?:\1 {2,}\S.*\n?)*)/gm;
const nodeVersionInput = /^\s*node-version:\s*(.*?)\s*$/gm;
const nodeVersionFileInput = /^\s*node-version-file:\s*(\S+)\s*$/m;

function catalogVersions(): Record<string, string> {
  const block = catalogBlock.exec(readFileSync(join(repositoryRoot, workspaceFile), "utf8"))?.[1];
  const entries = (block ?? "")
    .split("\n")
    .map((line) => catalogEntry.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map(([, , name, version]): [string, string] => [name, version]);
  if (entries.length === 0) throw new Error(`${workspaceFile}: no catalog entries were found.`);
  return Object.fromEntries(entries);
}

function installedDependencies(manifest: Manifest): [string, string][] {
  return Object.entries({ ...manifest.dependencies, ...manifest.devDependencies });
}

function lowestMajorOf(range: string): number | undefined {
  return semver.validRange(range) === null ? undefined : semver.minVersion(range)?.major;
}

test("the workspace has packages to check", () => {
  expect(packages.length).toBeGreaterThan(1);
});

test("no package installs a tool that Vite+ already provides", () => {
  const violations = packages.flatMap(({ path, manifest }) =>
    installedDependencies(manifest)
      .filter(([name]) => name in vitePlusCommandFor)
      .map(
        ([name]) => `${path}: remove "${name}" and run \`${vitePlusCommandFor[name]}\` instead.`,
      ),
  );

  expect(violations).toEqual([]);
});

test("no script calls Vite or a replaced tool directly", () => {
  const directCall = new RegExp(
    `(?:^|&&|\\|\\||;)\\s*(vite|${Object.keys(vitePlusCommandFor).join("|")})(?:\\s|$)`,
  );
  const violations = packages.flatMap(({ path, manifest }) =>
    Object.entries(manifest.scripts ?? {})
      .filter(([, command]) => directCall.test(command))
      .map(
        ([script, command]) =>
          `${path}: script "${script}" runs \`${command}\`. Call it through \`vp\` (vp dev, vp build, vp test, vp check).`,
      ),
  );

  expect(violations).toEqual([]);
});

test("every dependency version comes from the catalog or the workspace", () => {
  const violations = packages.flatMap(({ path, manifest }) =>
    installedDependencies(manifest)
      .filter(([, version]) => version !== "catalog:" && !version.startsWith("workspace:"))
      .map(
        ([name, version]) =>
          `${path}: "${name}" is pinned to "${version}". Add it to the catalog in pnpm-workspace.yaml and write "catalog:" here.`,
      ),
  );

  expect(violations).toEqual([]);
});

test("every package with TypeScript sources inherits the shared compiler settings", () => {
  const violations = packages.flatMap(({ path, directory }) => {
    const hasSources = globSync("src/**/*.{ts,tsx}", { cwd: directory }).length > 0;
    if (!hasSources) return [];

    const tsconfigPath = join(directory, "tsconfig.json");
    if (!existsSync(tsconfigPath)) {
      return [
        `${path}: add a tsconfig.json that extends tsconfig.base.json at the repository root.`,
      ];
    }

    const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8")) as {
      extends?: string;
      compilerOptions?: Record<string, unknown>;
    };
    const problems: string[] = [];
    if (!tsconfig.extends?.endsWith("tsconfig.base.json")) {
      problems.push(
        `${path}: tsconfig.json must extend tsconfig.base.json at the repository root.`,
      );
    }
    for (const option of ["jsx", "jsxImportSource", "strict"]) {
      if (tsconfig.compilerOptions && option in tsconfig.compilerOptions) {
        problems.push(
          `${path}: tsconfig.json sets "${option}". Remove it; tsconfig.base.json owns that option.`,
        );
      }
    }
    return problems;
  });

  expect(violations).toEqual([]);
});

test("a library package depends on nothing but Solid and StyleX, and only as peers", () => {
  const violations = libraryPackages.flatMap(({ path, manifest }) => [
    ...Object.keys(manifest.dependencies ?? {}).map(
      (name) =>
        `${path}: package "${manifest.name}" has the dependency "${name}". ${webStandardsOnly}`,
    ),
    ...Object.keys(manifest.peerDependencies ?? {})
      .filter((name) => !peerDependenciesALibraryMayHave.includes(name))
      .map(
        (name) =>
          `${path}: package "${manifest.name}" has the peer dependency "${name}". ${webStandardsOnly}`,
      ),
  ]);

  expect(libraryPackages.length).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});

function commentsOtherThanDocComments(file: string): string[] {
  const text = readFileSync(join(repositoryRoot, file), "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found = new Map<number, string>();
  const collect = (node: ts.Node): void => {
    const ranges = [
      ...(ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []),
      ...(ts.getTrailingCommentRanges(text, node.getEnd()) ?? []),
    ];
    for (const range of ranges) {
      const comment = text.slice(range.pos, range.end);
      if (!comment.startsWith("/**")) {
        const line = source.getLineAndCharacterOfPosition(range.pos).line + 1;
        found.set(range.pos, `${file}:${line}: ${comment.split("\n")[0]}`);
      }
    }
    for (const child of node.getChildren(source)) collect(child);
  };
  collect(source);
  return [...found.values()];
}

test("source code carries no comment except a doc comment on a public API", () => {
  const comments = scriptFiles.flatMap(commentsOtherThanDocComments);

  expect(scriptFiles.length).toBeGreaterThan(10);
  expect(comments, "Remove the comment and say it with a name, a constant or a test.").toEqual([]);
});

test("every peer range of a library package accepts the version the catalog pins", () => {
  const catalog = catalogVersions();
  const violations = libraryPackages.flatMap(({ path, manifest }) =>
    Object.entries(manifest.peerDependencies ?? {}).flatMap(([name, range]) => {
      const pinned = catalog[name];
      if (pinned === undefined)
        return [`${workspaceFile}: add "${name}" to the catalog, which ${path} names as a peer.`];
      return semver.satisfies(pinned, range, { includePrerelease: true })
        ? []
        : [
            `${path}: widen the peer range "${range}" of "${name}" so it accepts ${pinned}, the version the catalog in ${workspaceFile} pins.`,
          ];
    }),
  );

  expect(violations).toEqual([]);
});

test("the project is MIT-licensed in its licence text, its root manifest and every library package", () => {
  const licenceText = readFileSync(join(repositoryRoot, "LICENSE"), "utf8");
  const violations = libraryPackages
    .filter(({ manifest }) => manifest.license !== projectLicence)
    .map(
      ({ path, manifest }) =>
        `${path}: set "license" to "${projectLicence}", not "${manifest.license}".`,
    );

  expect(rootManifest.license, `package.json: set "license" to "${projectLicence}"`).toBe(
    projectLicence,
  );
  expect(licenceText.split("\n")[0], `LICENSE: start with "${projectLicence} License"`).toBe(
    `${projectLicence} License`,
  );
  expect(violations).toEqual([]);
});

test("every workflow runs the Node that engines.node in package.json names, and names none of its own", () => {
  const nodeRange = rootManifest.engines?.node ?? "";
  const readFromHome = `Set \`node-version-file: ${nodeVersionHome}\`, so CI runs the Node that engines.node in ${nodeVersionHome} names (${nodeRange}).`;
  const workflows = workflowFiles.map((file) => ({
    file,
    text: readFileSync(join(repositoryRoot, file), "utf8"),
  }));
  const ownVersions = workflows.flatMap(({ file, text }) =>
    [...text.matchAll(nodeVersionInput)].map(
      ([, version]) => `${file}: remove \`node-version: ${version}\`. ${readFromHome}`,
    ),
  );
  const setupSteps = workflows.flatMap(({ file, text }) =>
    [...text.matchAll(setupVpStep)].map(([, , inputs]) => ({
      file,
      source: nodeVersionFileInput.exec(inputs)?.[1],
    })),
  );
  const otherSources = setupSteps
    .filter(({ source }) => source !== nodeVersionHome)
    .map(
      ({ file, source }) =>
        `${file}: a setup-vp step reads Node from ${source ?? "no file"}. ${readFromHome}`,
    );

  expect(
    lowestMajorOf(nodeRange),
    `${nodeVersionHome}: set "engines.node" to the Node range the project runs on`,
  ).toBeDefined();
  expect(setupSteps.length).toBeGreaterThan(0);
  expect([...ownVersions, ...otherSources]).toEqual([]);
});

test("the Node version is written once, in engines.node in package.json, and @types/node shares its major", () => {
  const nodeRange = rootManifest.engines?.node ?? "";
  const nodeMajor = lowestMajorOf(nodeRange);
  const typesRange = catalogVersions()["@types/node"] ?? "";
  const writtenAgain = packages.flatMap(({ path, directory, manifest }) => [
    ...nodeVersionFilesThatCompete
      .filter((file) => existsSync(join(directory, file)))
      .map((file) => join(dirname(path), file)),
    ...(manifest.devEngines?.runtime === undefined ? [] : [`${path} devEngines.runtime`]),
    ...(manifest.engines?.node === undefined || path === nodeVersionHome
      ? []
      : [`${path} engines.node`]),
  ]);

  expect(
    writtenAgain,
    `Remove these. The Node version lives only in engines.node in ${nodeVersionHome}, which Vite+, pnpm and CI all read.`,
  ).toEqual([]);
  expect(
    lowestMajorOf(typesRange),
    `${workspaceFile}: set "@types/node" (now ${typesRange}) to Node ${nodeMajor}, the major that engines.node in ${nodeVersionHome} names (${nodeRange}).`,
  ).toBe(nodeMajor);
});
