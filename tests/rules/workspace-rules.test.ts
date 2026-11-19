import { existsSync, globSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { findPackageJSON } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import semver from "semver";
import { expect, test } from "vite-plus/test";
import {
  commentsIn,
  descendants,
  moduleSpecifierOf,
  parse,
  parseAll,
  parseText,
  parseWithoutLibrariesOrImports,
  sharedSettings,
  typeCheckedProjects,
  staticPropertyName,
  ts,
} from "#/scripts/syntax.ts";
import { solidPackages } from "#/scripts/newest-releases.ts";
import { type PnpmSettings, pnpmSettings } from "#/scripts/pnpm-settings.ts";
import { storybookAppManifest } from "#/scripts/release-sources.ts";
import {
  type AllowedRuntimeDependency,
  allowedRuntimeDependencies,
  runtimeDependencyList,
} from "#/scripts/runtime-dependencies.ts";
import {
  type Dependent,
  type Installed,
  type Manifest,
  installedDependencies,
  installedVersions,
  libraryNames,
  ownLibraryPeerRange,
  runtimeVersions,
  libraryPackages,
  listed,
  outsideGeneratedOrInstalled,
  packages,
  repositoryRoot,
  rootManifest,
  scriptFiles,
  whyInstalled,
  workflowFiles,
  workspaceFile,
} from "#/tests/support/workspace.ts";

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
const catalogReference = "catalog:";
const webStandardsOnly =
  "A library is built on web standards: it names Solid, StyleX and the primitives package as peers, and has a runtime dependency only where the owner decided on one. Use a platform feature or a fallback written in this repository, or record the decision in that list with its reason.";

const nodeVersionHome = "package.json";
const nodeVersionFilesThatCompete = "**/{.node-version,.nvmrc,.tool-versions}";
const namesNodeVersion = /node-version["']?\s*:/;
const namesNodeVersionFile = /node-version-file["']?\s*:\s*(.*?)\s*$/;
const namesRunner = /runs-on["']?\s*:/;
const typeScriptApi = /^typescript(?:\/|$)/;
const typeScriptApiHome = "scripts/syntax/";
const typeScriptApiEntry = "scripts/syntax.ts";
const typeScriptApiList = "scripts/syntax/ast.ts";
const typeScriptProjectOpener = "scripts/syntax/program.ts";
const sharedSettingsFile = "tsconfig.base.json";
const optionsOfTheParseOnlyProject = ["allowJs", "noLib", "noResolve"];
const optionsOfTheTypeCheckedProject = ["allowJs"];
const optionsOfTheProjectWithNodeTypes = ["allowJs", "types"];
const pnpmSettingsReader = "scripts/pnpm-settings.ts";
const jobHeader = /^ {2}[\w-]+:$/;
const jobTimeout = /^ {4}timeout-minutes: \d+$/;
const storybookInterfaceLibrary = "react";
const storybookInterfaceLibraryDeclarer = "@storybook/icons";
const storybookDirectory = join(repositoryRoot, dirname(storybookAppManifest));
const packageManifest = "package.json";
const dependencyLists = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

function runtimeDependencies(manifest: Manifest): string[] {
  const bundled = [manifest.bundledDependencies, manifest.bundleDependencies].flatMap((names) =>
    Array.isArray(names) ? names : [],
  );
  return [...new Set([...Object.keys(runtimeVersions(manifest)), ...bundled])];
}

function lowestMajorOf(range: string): number | undefined {
  return semver.validRange(range) === null ? undefined : semver.minVersion(range)?.major;
}

function nodeRangeAndLowestMajor(): [string, number] {
  const range = rootManifest().engines?.node;
  const major =
    range === undefined || semver.validRange(range) === "*" ? undefined : lowestMajorOf(range);
  if (range === undefined || major === undefined)
    throw new Error(`${nodeVersionHome}: set "engines.node" to the Node range the project runs on`);
  return [range, major];
}

const [nodeRange, nodeMajor] = nodeRangeAndLowestMajor();

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
      .filter(([, version]) => version !== catalogReference && !version.startsWith("workspace:"))
      .map(
        ([name, version]) =>
          `${path}: "${name}" is pinned to "${version}". Add it to the catalog in pnpm-workspace.yaml and write "catalog:" here.`,
      ),
  );

  expect(violations).toEqual([]);
});

type ProjectSettings = { extends?: string; compilerOptions?: Record<string, unknown> };

const sharedOptions = Object.keys(
  (JSON.parse(readFileSync(join(repositoryRoot, sharedSettingsFile), "utf8")) as ProjectSettings)
    .compilerOptions ?? {},
);

function optionsTheSharedSettingsOwn(where: string, options: object): string[] {
  return Object.keys(options)
    .filter((option) => sharedOptions.includes(option))
    .map(
      (option) => `${where} sets "${option}". Remove it; ${sharedSettingsFile} owns that option.`,
    );
}

test(`every package with TypeScript sources has a tsconfig.json, and every tsconfig*.json but ${sharedSettingsFile} extends it and sets no option it sets`, () => {
  const withoutProject = packages
    .filter(
      ({ directory }) =>
        globSync("src/**/*.{ts,tsx}", { cwd: directory }).length > 0 &&
        !existsSync(join(directory, "tsconfig.json")),
    )
    .map(
      ({ path }) =>
        `${path}: add a tsconfig.json that extends ${sharedSettingsFile} at the repository root.`,
    );
  const projects = globSync("**/tsconfig*.json", {
    cwd: repositoryRoot,
    exclude: outsideGeneratedOrInstalled,
  }).filter((path) => path !== sharedSettingsFile);
  const violations = projects.flatMap((path) => {
    const project = JSON.parse(readFileSync(join(repositoryRoot, path), "utf8")) as ProjectSettings;
    return [
      ...(project.extends?.endsWith(sharedSettingsFile)
        ? []
        : [`${path} must extend ${sharedSettingsFile} at the repository root.`]),
      ...optionsTheSharedSettingsOwn(path, project.compilerOptions ?? {}),
    ];
  });

  expect(sharedOptions.length).toBeGreaterThan(0);
  expect(projects.length).toBeGreaterThan(packages.length / 2);
  expect([...withoutProject, ...violations]).toEqual([]);
});

function hasProperty(name: string): (property: ts.ObjectLiteralElementLike) => boolean {
  return (property) => staticPropertyName(property) === name;
}

test(`every project ${typeScriptProjectOpener} opens extends ${sharedSettingsFile} and sets no option it sets, the type-checked project adds ${optionsOfTheTypeCheckedProject.join(", ")}, the one with Node's types adds ${optionsOfTheProjectWithNodeTypes.join(" and ")} naming node, and the parse-only project adds ${optionsOfTheParseOnlyProject.join(", ")}`, () => {
  const source = parse(join(repositoryRoot, typeScriptProjectOpener));
  const nodes = descendants(source);
  const settingsWritten = nodes
    .filter(ts.isObjectLiteralExpression)
    .filter(({ properties }) => properties.some(hasProperty("compilerOptions")));
  const withoutTheSharedSettings = settingsWritten.filter(
    ({ properties }) =>
      !properties.some(
        (property) =>
          hasProperty("extends")(property) &&
          ts.isPropertyAssignment(property) &&
          property.initializer.getText() === "sharedSettings",
      ),
  );
  const optionsOfEachProject = nodes
    .filter(ts.isCallExpression)
    .filter(({ expression }) => expression.getText() === "openProject")
    .map((call) => call.arguments[1]?.getText());

  expect(sharedSettings).toBe(join(repositoryRoot, sharedSettingsFile));
  expect(settingsWritten.length).toBeGreaterThan(0);
  expect(withoutTheSharedSettings.map((settings) => settings.getText())).toEqual([]);
  expect(optionsOfEachProject).toEqual([
    "parseWithoutLibrariesOrImports",
    "typeCheckedProjects[project]",
  ]);
  expect(Object.keys(parseWithoutLibrariesOrImports)).toEqual(optionsOfTheParseOnlyProject);
  expect(Object.keys(typeCheckedProjects)).toEqual(["scripts", "withNodeTypes"]);
  expect(Object.keys(typeCheckedProjects.scripts)).toEqual(optionsOfTheTypeCheckedProject);
  expect(Object.keys(typeCheckedProjects.withNodeTypes)).toEqual(optionsOfTheProjectWithNodeTypes);
  expect(typeCheckedProjects.withNodeTypes.types).toEqual(["node"]);
  expect([
    ...optionsTheSharedSettingsOwn(typeScriptProjectOpener, parseWithoutLibrariesOrImports),
    ...Object.values(typeCheckedProjects).flatMap((settings) =>
      optionsTheSharedSettingsOwn(typeScriptProjectOpener, settings),
    ),
  ]).toEqual([]);
});

function runtimeDependencyProblems(
  libraries: readonly { path: string; manifest: Manifest }[],
  allowed: readonly AllowedRuntimeDependency[],
  catalog: Record<string, string>,
  exists: (file: string) => boolean,
): string[] {
  const entryFor = (library: string | undefined, dependency: string) =>
    allowed.find((entry) => entry.library === library && entry.dependency === dependency);
  const ownLibraries = libraries.map(({ manifest }) => manifest.name);
  return [
    ...libraries.flatMap(({ path, manifest }) =>
      runtimeDependencies(manifest)
        .filter((name) => entryFor(manifest.name, name) === undefined)
        .map(
          (name) =>
            `${path}: package "${manifest.name}" has the runtime dependency "${name}", which ${runtimeDependencyList} does not allow. ${webStandardsOnly}`,
        ),
    ),
    ...allowed.flatMap(({ library, dependency, seam, reason }) => {
      const owner = libraries.find(({ manifest }) => manifest.name === library);
      if (ownLibraries.includes(dependency)) {
        return [
          `${runtimeDependencyList}: remove "${dependency}" of "${library}". It is a library of this repository, which "${library}" names as a "${ownLibraryPeerRange}" peer, so a consumer who uses both gets one copy; this list is for packages from outside the repository.`,
        ];
      }
      return [
        ...(reason?.trim()
          ? []
          : [
              `${runtimeDependencyList}: give "${dependency}" of "${library}" a reason, the decision that allows it.`,
            ]),
        ...(owner !== undefined && runtimeDependencies(owner.manifest).includes(dependency)
          ? []
          : [
              `${runtimeDependencyList}: remove "${dependency}" of "${library}", which that package does not depend on.`,
            ]),
        ...(semver.valid(catalog[dependency] ?? "") === null
          ? [
              `${workspaceFile}: pin "${dependency}" to one exact version in the catalog, not "${catalog[dependency]}": a consumer installs the version this repository verified.`,
            ]
          : []),
        ...(exists(seam)
          ? []
          : [
              `${runtimeDependencyList}: name the seam of "${dependency}" in "${library}", the one source file that imports it, not "${seam}".`,
            ]),
      ];
    }),
  ];
}

test(`a library has no runtime dependency, in any list that installs with it, but a package from outside the repository that ${runtimeDependencyList} allows with a reason, pinned to one exact version, naming an existing file as its seam`, () => {
  const library = { path: "packages/a/package.json", manifest: { name: "a" } };
  const withB = (list: Partial<Manifest>) => ({ ...library, manifest: { name: "a", ...list } });
  const dependsOnB = withB({ dependencies: { b: "catalog:" } });
  const entry = {
    library: "a",
    dependency: "b",
    seam: "packages/a/src/b.ts",
    reason: "A decision.",
  };
  const own = { path: "packages/b/package.json", manifest: { name: "b" } };
  const present = (file: string) => file === entry.seam;
  const problems = (
    libraries: Parameters<typeof runtimeDependencyProblems>[0],
    allowed: AllowedRuntimeDependency[],
    catalog: Record<string, string>,
  ) => runtimeDependencyProblems(libraries, allowed, catalog, present);
  const unlisted = expect.stringContaining('has the runtime dependency "b"');

  expect(
    runtimeDependencyProblems(
      libraryPackages,
      allowedRuntimeDependencies(),
      pnpmSettings().catalog,
      (file) => existsSync(join(repositoryRoot, file)),
    ),
  ).toEqual([]);
  expect(problems([dependsOnB], [entry], { b: "1.0.0-beta.1" })).toEqual([]);
  expect(problems([dependsOnB], [], {})).toEqual([unlisted]);
  expect(problems([withB({ optionalDependencies: { b: "catalog:" } })], [], {})).toEqual([
    unlisted,
  ]);
  expect(problems([withB({ bundledDependencies: ["b"] })], [], {})).toEqual([unlisted]);
  expect(problems([withB({ bundleDependencies: ["b"] })], [], {})).toEqual([unlisted]);
  expect(problems([dependsOnB], [{ ...entry, reason: " " }], { b: "1.0.0" })).toEqual([
    expect.stringContaining('give "b" of "a" a reason'),
  ]);
  expect(problems([library], [entry], { b: "1.0.0" })).toEqual([
    expect.stringContaining('remove "b" of "a"'),
  ]);
  expect(problems([dependsOnB], [entry], { b: "^1.0.0" })).toEqual([
    expect.stringContaining('pin "b" to one exact version'),
  ]);
  expect(
    problems([dependsOnB], [{ ...entry, seam: "packages/a/src/gone.ts" }], { b: "1.0.0" }),
  ).toEqual([expect.stringContaining('name the seam of "b" in "a"')]);
  expect(problems([withB({ dependencies: { b: "workspace:*" } }), own], [], {})).toEqual([
    unlisted,
  ]);
  expect(problems([withB({ dependencies: { b: "workspace:*" } }), own], [entry], {})).toEqual([
    expect.stringContaining("It is a library of this repository"),
  ]);
});

function lineOf(source: ts.SourceFile, position: number): number {
  return source.getLineAndCharacterOfPosition(position).line + 1;
}

function commentsOtherThanDocComments(file: string, source: ts.SourceFile): string[] {
  return commentsIn(source)
    .filter(({ text }) => !text.startsWith("/**"))
    .map(({ pos, text }) => `${file}:${lineOf(source, pos)}: ${text.split("\n")[0]}`);
}

function typeScriptApiImports(file: string, source: ts.SourceFile): string[] {
  return descendants(source).flatMap((node) => {
    const specifier = moduleSpecifierOf(node);
    return specifier && ts.isStringLiteralLikeNode(specifier) && typeScriptApi.test(specifier.text)
      ? [
          `${file}:${lineOf(source, node.getStart())}: ${node.getText().split("\n")[0]} imports the TypeScript API. Import it from ${typeScriptApiEntry}.`,
        ]
      : [];
  });
}

test(`no file outside ${typeScriptApiHome} imports the TypeScript API`, () => {
  const files = scriptFiles.filter((file) => !file.startsWith(typeScriptApiHome));
  const sources = parseAll(files.map((file) => join(repositoryRoot, file)));
  const violations = files.flatMap((file, index) => typeScriptApiImports(file, sources[index]));

  expect(files.length).toBeGreaterThan(10);
  expect(violations).toEqual([]);
});

test("the TypeScript API rule flags each way a file can load typescript, and an import of the syntax module passes", () => {
  const file = "tests/typescript-api-imports.ts";
  const lines = [
    'import ts from "typescript";',
    'import { API } from "typescript/unstable/sync";',
    'export { SyntaxKind } from "typescript/unstable/ast";',
    'const later = await import("typescript");',
    'const required = require("typescript");',
    'type Tree = import("typescript/unstable/ast").Node;',
    'import { parse } from "#/scripts/syntax.ts";',
    'const named = "typescript";',
  ];
  const source = parseText(lines.join("\n"), ".ts");
  const flagged = typeScriptApiImports(file, source).map(
    (violation) => /^[^:]+:(\d+):/.exec(violation)?.[1],
  );

  expect(flagged).toEqual(["1", "2", "3", "4", "5", "6"]);
});

function typeScriptApiNames(): string[] {
  const [list] = parseAll([join(repositoryRoot, typeScriptApiList)]);
  return list.statements.flatMap((statement) =>
    ts.isExportDeclaration(statement) &&
    statement.exportClause &&
    ts.isNamedExports(statement.exportClause)
      ? statement.exportClause.elements.map((element) => element.name.text)
      : [],
  );
}

function tsMembersNamedIn(source: ts.SourceFile): string[] {
  return descendants(source).flatMap((node) => {
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      return node.expression.text === "ts" ? [node.name.text] : [];
    }
    if (ts.isQualifiedName(node) && ts.isIdentifier(node.left)) {
      return node.left.text === "ts" ? [node.right.text] : [];
    }
    return [];
  });
}

test(`${typeScriptApiList} lists no member of ts that no file names`, () => {
  const listed = typeScriptApiNames();
  const sources = parseAll(scriptFiles.map((file) => join(repositoryRoot, file)));
  const named = new Set(sources.flatMap(tsMembersNamedIn));
  const unused = listed
    .filter((name) => !named.has(name))
    .map(
      (name) =>
        `${typeScriptApiList}: no file names ts.${name}; remove it from the list, so the list stays what a TypeScript upgrade has to keep working.`,
    );

  expect(listed.length).toBeGreaterThan(10);
  expect(unused).toEqual([]);
});

test("parse gives a file's text as this process first read it, and does not see the file rewritten afterwards", () => {
  const directory = mkdtempSync(join(tmpdir(), "syntax-"));
  const file = join(directory, "rewritten.ts");

  writeFileSync(file, "const first = 1;\n");
  const firstRead = parse(file).getText();
  writeFileSync(file, "const second = 2;\n");
  const secondRead = parse(file).getText();
  rmSync(directory, { recursive: true });

  expect([firstRead, secondRead]).toEqual(["const first = 1;\n", "const first = 1;\n"]);
});

function pathsOfTheWorkspaceFile(file: string, source: ts.SourceFile): string[] {
  return descendants(source).flatMap((node) =>
    ts.isStringLiteralLikeNode(node) &&
    (node.text === workspaceFile || node.text.endsWith(`/${workspaceFile}`))
      ? [
          `${file}:${lineOf(source, node.getStart())}: ${node.getText()} writes the path of ${workspaceFile}. Take its settings from pnpmSettings() in ${pnpmSettingsReader}, which asks pnpm, so no second parser can disagree with pnpm.`,
        ]
      : [],
  );
}

test(`no script or test but ${pnpmSettingsReader} writes the path of ${workspaceFile} as a string`, () => {
  const files = scriptFiles.filter((file) => file !== pnpmSettingsReader);
  const sources = parseAll(files.map((file) => join(repositoryRoot, file)));
  const violations = files.flatMap((file, index) => pathsOfTheWorkspaceFile(file, sources[index]));
  const flagged = pathsOfTheWorkspaceFile(
    "tests/a-second-parser.ts",
    parseText(
      [
        'const file = "../pnpm-workspace.yaml";',
        'const text = readFileSync(join(repositoryRoot, "pnpm-workspace.yaml"), "utf8");',
        "const quoted = `pnpm-workspace.yaml`;",
        'const message = "set minimumReleaseAge in pnpm-workspace.yaml";',
      ].join("\n"),
      ".ts",
    ),
  ).map((violation) => /^[^:]+:(\d+):/.exec(violation)?.[1]);

  expect(scriptFiles).toContain(pnpmSettingsReader);
  expect(violations).toEqual([]);
  expect(flagged).toEqual(["1", "2", "3"]);
});

test("commentsIn finds each comment, and nothing inside a regular expression, a template, a string or JSX text", () => {
  const source = parseText(
    [
      "const a = 1 /* in binary */ + 2;",
      "const re = /\\/\\/not-a-comment/g; // trailing",
      "const t = `x ${a /* in template */} // not`;",
      'const s = "// not a comment";',
      "function f(/* param */ p: number) { return p; }",
      'const el = <div /* attr */ class="x">{/* jsx */}// jsx text not comment</div>;',
      "type T = { /* in type */ k: string };",
      "const o = { k: 1, /* after comma */ };",
      "const div = a / 2 / 1; // after division",
      "label: for (;;) { break label; /* after break */ }",
      "export {}; // eof",
    ].join("\n"),
    ".tsx",
  );

  expect(commentsIn(source).map(({ text }) => text)).toEqual([
    "/* in binary */",
    "// trailing",
    "/* in template */",
    "/* param */",
    "/* attr */",
    "/* jsx */",
    "/* in type */",
    "/* after comma */",
    "// after division",
    "/* after break */",
    "// eof",
  ]);
});

test("every workflow job sets timeout-minutes, so a hung step ends", () => {
  const violations = workflowFiles.flatMap((file) => {
    const lines = readFileSync(join(repositoryRoot, file), "utf8").split("\n");
    const jobsAt = lines.indexOf("jobs:");
    const starts = lines.flatMap((line, index) =>
      index > jobsAt && jobHeader.test(line) ? [index] : [],
    );
    return starts.flatMap((start, position) => {
      const block = lines.slice(start + 1, starts[position + 1] ?? lines.length);
      return block.some((line) => jobTimeout.test(line))
        ? []
        : [`${file}: give the job ${lines[start].trim()} a timeout-minutes.`];
    });
  });

  expect(workflowFiles.length).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});

test("source code carries no comment except a doc comment on a public API", () => {
  const sources = parseAll(scriptFiles.map((file) => join(repositoryRoot, file)));
  const comments = scriptFiles.flatMap((file, index) =>
    commentsOtherThanDocComments(file, sources[index]),
  );

  expect(scriptFiles.length).toBeGreaterThan(10);
  expect(comments, "Remove the comment and say it with a name, a constant or a test.").toEqual([]);
});

function installAdvice(
  name: string,
  { catalog, overrides }: PnpmSettings,
  installed: readonly Installed[],
): string {
  if (catalog[name] === undefined) {
    return `Pin it in the catalog in ${workspaceFile} and override it there with "${catalogReference}", so a package that brings it in cannot hold a different release.`;
  }
  const askers = [
    ...(overrides[name] === catalogReference ? [`the overrides of ${workspaceFile}`] : []),
    ...packages
      .filter(({ manifest }) =>
        installedDependencies(manifest).some(
          ([dependency, version]) => dependency === name && version === catalogReference,
        ),
      )
      .map(({ path }) => path),
  ];
  const atTheCatalog = installed.some(
    (each) => each.name === name && each.version === catalog[name],
  );
  if (overrides[name] === catalogReference || (askers.length > 0 && !atTheCatalog)) {
    return `It is asked for with "${catalogReference}" in ${listed(askers)}, so the install does not follow the catalog: run \`vp install\` so the lockfile and the install take the catalog's version.`;
  }
  return `Override it in ${workspaceFile} with "${catalogReference}", so a package that brings it in cannot hold a different release.`;
}

test("every package on the Solid 2 channel is pinned to one release and installed only at it", () => {
  const settings = pnpmSettings();
  const { catalog } = settings;
  const installed = installedVersions(solidPackages);
  const [first = ""] = solidPackages;
  const violations = [
    ...solidPackages
      .filter((name) => catalog[name] !== catalog[first])
      .map(
        (name) =>
          `${workspaceFile}: pin ${name} to ${catalog[first] ?? "a release"}, the release ${first} is pinned to, not ${catalog[name] ?? "nothing"}: the packages of a Solid release move together.`,
      ),
    ...solidPackages
      .filter((name) => !installed.some((each) => each.name === name))
      .map((name) => `${name} is not installed, so nothing tells which release it is.`),
    ...installed
      .filter(({ name, version }) => version !== catalog[name])
      .map(
        ({ name, version }) =>
          `${name} is installed at ${version}, not ${catalog[name] ?? "a version"}, which the catalog in ${workspaceFile} pins. ${installAdvice(name, settings, installed)}`,
      ),
  ];

  expect(violations).toEqual([]);
});

test("the catalog pins vite to the Vite+ core that the pinned vite-plus depends on", () => {
  const { catalog } = pnpmSettings();
  const manifestPath = findPackageJSON("vite-plus", join(repositoryRoot, packageManifest)) ?? "";
  const vitePlus = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest & { version: string };
  const core = vitePlus.dependencies?.vite;

  expect(vitePlus.version, "run `vp install`, so vite-plus is at the catalog's release").toBe(
    catalog["vite-plus"],
  );
  expect(
    catalog.vite,
    `${workspaceFile}: pin vite to ${core}, the core vite-plus ${vitePlus.version} depends on. The vite@* override gives every package the catalog's vite, so another core would run under this vite-plus with no warning.`,
  ).toBe(core);
});

function prereleasesNamedBy(range: string): string[] {
  return new semver.Range(range).set
    .flat()
    .filter(
      ({ operator, semver: bound }) =>
        Array.isArray(bound.prerelease) &&
        bound.prerelease.length > 0 &&
        !(operator === "<" && bound.prerelease.join(".") === "0"),
    )
    .map(({ value }) => value);
}

test("every peer range of a library package accepts the version the catalog pins, and where the catalog pins a stable release, names no prerelease and accepts nothing below the pinned major", () => {
  const { catalog } = pnpmSettings();
  const violations = libraryPackages.flatMap(({ path, manifest }) =>
    Object.entries(manifest.peerDependencies ?? {}).flatMap(([name, range]) => {
      if (libraryNames.includes(name)) return [];
      const pinned = catalog[name];
      if (pinned === undefined)
        return [`${workspaceFile}: add "${name}" to the catalog, which ${path} names as a peer.`];
      if (!semver.satisfies(pinned, range, { includePrerelease: true })) {
        return [
          `${path}: widen the peer range "${range}" of "${name}" so it accepts ${pinned}, the version the catalog in ${workspaceFile} pins.`,
        ];
      }
      if (semver.prerelease(pinned) !== null) return [];
      const lowest = semver.minVersion(range)?.version ?? "";
      return [
        ...prereleasesNamedBy(range).map(
          (comparator) =>
            `${path}: the peer range "${range}" of "${name}" names the prerelease ${comparator}; the catalog pins ${pinned}, a stable release, so name stable releases only.`,
        ),
        ...(semver.major(lowest) === semver.major(pinned)
          ? []
          : [
              `${path}: the lowest version the peer range "${range}" of "${name}" accepts, ${lowest}, is not on major ${semver.major(pinned)} of ${pinned}, which the catalog pins.`,
            ]),
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

  expect(rootManifest().license, `package.json: set "license" to "${projectLicence}"`).toBe(
    projectLicence,
  );
  expect(licenceText.split("\n")[0], `LICENSE: start with "${projectLicence} License"`).toBe(
    `${projectLicence} License`,
  );
  expect(violations).toEqual([]);
});

test("in every workflow, each node-version-file is package.json, no line names node-version, and node-version-file lines are at least as many as runs-on lines", () => {
  const readFromHome = `Set \`node-version-file: ${nodeVersionHome}\`, so CI runs the Node that engines.node in ${nodeVersionHome} names (${nodeRange}).`;
  const violations = workflowFiles.flatMap((file) => {
    const lines = readFileSync(join(repositoryRoot, file), "utf8").split("\n");
    const numbered = lines.map((line, index) => ({ line, at: `${file}:${index + 1}` }));
    const sources = numbered.flatMap(({ line, at }) => {
      const source = namesNodeVersionFile.exec(line)?.[1];
      return source === undefined ? [] : [{ source, at }];
    });
    const runners = lines.filter((line) => namesRunner.test(line)).length;
    const readsFromHome = sources.filter(({ source }) => source === nodeVersionHome).length;
    return [
      ...sources
        .filter(({ source }) => source !== nodeVersionHome)
        .map(({ source, at }) => `${at}: reads Node from ${source}. ${readFromHome}`),
      ...numbered
        .filter(({ line }) => namesNodeVersion.test(line))
        .map(({ line, at }) => `${at}: remove \`${line.trim()}\`. ${readFromHome}`),
      ...(readsFromHome >= runners
        ? []
        : [
            `${file}: ${runners} runs-on lines but ${readsFromHome} \`node-version-file: ${nodeVersionHome}\` lines. Give every job a setup step that reads Node from ${nodeVersionHome}.`,
          ]),
    ];
  });

  expect(workflowFiles.length).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});

test("no .node-version, .nvmrc or .tool-versions file, devEngines.runtime or engines.node outside package.json exists, and @types/node shares the lowest major of engines.node", () => {
  const typesRange = pnpmSettings().catalog["@types/node"] ?? "";
  const writtenAgain = [
    ...globSync(nodeVersionFilesThatCompete, {
      cwd: repositoryRoot,
      exclude: outsideGeneratedOrInstalled,
    }),
    ...packages.flatMap(({ path, manifest }) => [
      ...(manifest.devEngines?.runtime === undefined ? [] : [`${path} devEngines.runtime`]),
      ...(manifest.engines?.node === undefined || path === nodeVersionHome
        ? []
        : [`${path} engines.node`]),
    ]),
  ];

  expect(
    writtenAgain,
    `Remove these. The Node version lives only in engines.node in ${nodeVersionHome}, which Vite+, pnpm and CI all read.`,
  ).toEqual([]);
  expect(
    lowestMajorOf(typesRange),
    `${workspaceFile}: set "@types/node" (now ${typesRange}) to Node ${nodeMajor}, the major that engines.node in ${nodeVersionHome} names (${nodeRange}).`,
  ).toBe(nodeMajor);
});

function workspacePackagesReaching(dependents: readonly Dependent[]): string[] {
  return dependents.flatMap((dependent) =>
    dependent.depField === undefined
      ? workspacePackagesReaching(dependent.dependents ?? [])
      : [dependent.name],
  );
}

function resolvesFrom(directory: string, name: string): boolean {
  try {
    return findPackageJSON(name, join(directory, packageManifest)) !== undefined;
  } catch {
    return false;
  }
}

function namedPackages(manifest: Manifest): string[] {
  return [...new Set(dependencyLists.flatMap((list) => Object.keys(manifest[list] ?? {})))];
}

test(`${storybookInterfaceLibrary} is installed only as a dependency of ${storybookInterfaceLibraryDeclarer}`, () => {
  const installed = whyInstalled([storybookInterfaceLibrary]);

  expect(installed.length).toBeGreaterThan(0);
  expect(
    installed.flatMap(({ dependents = [] }) =>
      dependents
        .filter(({ name }) => name !== storybookInterfaceLibraryDeclarer)
        .map(({ name }) => name),
    ),
  ).toEqual([]);
});

test(`only the Storybook app reaches ${storybookInterfaceLibrary} through what it installs`, () => {
  const storybookApp = packages.find(({ directory }) => directory === storybookDirectory);
  const reachedBy = new Set(
    whyInstalled([storybookInterfaceLibrary]).flatMap(({ dependents = [] }) =>
      workspacePackagesReaching(dependents),
    ),
  );

  expect(storybookApp?.manifest.name).toBeDefined();
  expect([...reachedBy]).toEqual([storybookApp?.manifest.name]);
});

test(`no workspace manifest names ${storybookInterfaceLibrary}`, () => {
  expect(
    packages.flatMap(({ path, manifest }) =>
      dependencyLists
        .filter((list) => manifest[list]?.[storybookInterfaceLibrary] !== undefined)
        .map((list) => `${path} names ${storybookInterfaceLibrary} in ${list}.`),
    ),
  ).toEqual([]);
});

test("the resolver finds every package that a workspace package names, from that package's directory", () => {
  expect(
    packages.flatMap(({ path, directory, manifest }) =>
      namedPackages(manifest)
        .filter((name) => !resolvesFrom(directory, name))
        .map((name) => `${path}: ${name} does not resolve.`),
    ),
  ).toEqual([]);
});

test(`no workspace package resolves ${storybookInterfaceLibrary}`, () => {
  expect(
    packages
      .filter(({ directory }) => resolvesFrom(directory, storybookInterfaceLibrary))
      .map(({ path }) => `${storybookInterfaceLibrary} resolves from the directory of ${path}.`),
  ).toEqual([]);
});
