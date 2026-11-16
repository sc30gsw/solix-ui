import { execFileSync } from "node:child_process";
import { existsSync, globSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import semver from "semver";
import { expect, test } from "vite-plus/test";
import {
  commentsIn,
  descendants,
  parse,
  parseAll,
  parseText,
  parseWithoutLibrariesOrImports,
  sharedSettings,
  staticPropertyName,
  ts,
} from "../scripts/syntax";
import { solidPackages } from "../scripts/newest-releases";
import { pnpmSettings } from "../scripts/pnpm-settings";
import {
  type ExportTarget,
  type Manifest,
  installedVp,
  libraryNames,
  libraryPackages,
  outsideGeneratedOrInstalled,
  packages,
  primitivesDirectory,
  primitivesPackage,
  repositoryRoot,
  rootManifest,
  scriptFiles,
  workflowFiles,
  workspaceFile,
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
const frameworkPeers = ["solid-js", "@solidjs/web", "@stylexjs/stylex"];
const allowedForPrimitives = ["solid-js"];
const allowedForComponents = [...frameworkPeers, primitivesPackage.manifest.name ?? ""];
const ownLibraryPeerRange = "workspace:^";
const ownLibraryLink = "workspace:*";
const packAnswerTimeout = 30_000;
const webStandardsOnly =
  "A library is built on web standards and has no runtime dependency: it names Solid, StyleX and the primitives package as peers. Use a platform feature or a fallback written in this repository.";

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
const pnpmSettingsReader = "scripts/pnpm-settings.ts";
const jobHeader = /^ {2}[\w-]+:$/;
const jobTimeout = /^ {4}timeout-minutes: \d+$/;

function installedDependencies(manifest: Manifest): [string, string][] {
  return Object.entries({ ...manifest.dependencies, ...manifest.devDependencies });
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
      .filter(([, version]) => version !== "catalog:" && !version.startsWith("workspace:"))
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

test(`every project ${typeScriptProjectOpener} opens extends ${sharedSettingsFile} and sets no option it sets, and the parse-only project adds ${optionsOfTheParseOnlyProject.join(", ")}`, () => {
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
  expect(optionsOfEachProject).toEqual(["parseWithoutLibrariesOrImports", "{}"]);
  expect(Object.keys(parseWithoutLibrariesOrImports)).toEqual(optionsOfTheParseOnlyProject);
  expect(
    optionsTheSharedSettingsOwn(typeScriptProjectOpener, parseWithoutLibrariesOrImports),
  ).toEqual([]);
});

test("a library has no runtime dependency, and names as a peer, or as a library of this repository in any dependency list, only what its kind allows", () => {
  const violations = libraryPackages.flatMap(({ path, directory, manifest }) => {
    const [kind, allowed] =
      directory === primitivesDirectory
        ? ["the primitives package", allowedForPrimitives]
        : ["a component library", allowedForComponents];
    const named = [
      ...Object.keys(manifest.peerDependencies ?? {}),
      ...installedDependencies(manifest)
        .map(([name]) => name)
        .filter((name) => libraryNames.includes(name)),
    ];
    return [
      ...Object.keys(manifest.dependencies ?? {}).map(
        (name) =>
          `${path}: package "${manifest.name}" has the runtime dependency "${name}". ${webStandardsOnly}`,
      ),
      ...[...new Set(named)]
        .filter((name) => !allowed.includes(name))
        .map(
          (name) =>
            `${path}: package "${manifest.name}" names "${name}", which ${kind} may not. It may name only ${allowed.join(", ")}.`,
        ),
    ];
  });

  expect(libraryPackages.length).toBeGreaterThan(1);
  expect(violations).toEqual([]);
});

function exportedFiles(target: ExportTarget | undefined): string[] {
  if (target === undefined || target === null) return [];
  if (typeof target === "string") return [target.replace(/^\.\//, "")];
  return Object.values(target).flatMap(exportedFiles);
}

function packedFiles(directory: string): string[] {
  const answer = execFileSync(installedVp, ["pm", "pack", "--json", "--", "--dry-run"], {
    cwd: directory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: packAnswerTimeout,
  });
  const packed: unknown = JSON.parse(answer);
  const files =
    typeof packed === "object" && packed !== null && "files" in packed ? packed.files : undefined;
  if (!Array.isArray(files)) {
    throw new Error(`${directory}: the pack listed no files. It answered: ${answer}`);
  }
  return files.map((file: { path: string }) => file.path);
}

function filesBeside(directory: string, exported: string[]): string[] {
  const folders = new Set(exported.flatMap((file) => file.split("/").slice(0, 1)));
  return [...folders].flatMap((folder) =>
    globSync(`${folder}/**`, { cwd: directory, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => relative(directory, join(entry.parentPath, entry.name)).split(sep).join("/")),
  );
}

test("a library exports a file, and its packed tarball holds every file its exports name and every file in their folders", () => {
  const violations = libraryPackages.flatMap(({ path, directory, manifest }) => {
    const exported = [...new Set(exportedFiles(manifest.exports))];
    const needed = [...new Set([...exported, ...filesBeside(directory, exported)])];
    const packed = packedFiles(directory);
    return [
      ...(exported.length === 0 ? [`${path}: package "${manifest.name}" exports no file.`] : []),
      ...needed
        .filter((file) => !packed.includes(file))
        .map(
          (file) =>
            `${path}: the packed tarball of "${manifest.name}" leaves out ${file}, which "exports" names or which sits in the folder of a file they name.`,
        ),
    ];
  });

  expect(libraryPackages.length).toBeGreaterThan(1);
  expect(violations).toEqual([]);
});

test("a library names another library of this repository as a workspace:^ peer, linked as a workspace:* devDependency", () => {
  const violations = libraryPackages.flatMap(({ path, manifest }) =>
    Object.entries(manifest.peerDependencies ?? {})
      .filter(([name]) => libraryNames.includes(name))
      .flatMap(([name, range]) => [
        ...(range === ownLibraryPeerRange
          ? []
          : [
              `${path}: write the peer "${name}" as "${ownLibraryPeerRange}", so publishing pins the version this workspace builds against.`,
            ]),
        ...(manifest.devDependencies?.[name] === ownLibraryLink
          ? []
          : [
              `${path}: add "${name}": "${ownLibraryLink}" to devDependencies, so the workspace links the library it names as a peer.`,
            ]),
      ]),
  );

  expect(violations).toEqual([]);
});

function lineOf(source: ts.SourceFile, position: number): number {
  return source.getLineAndCharacterOfPosition(position).line + 1;
}

function commentsOtherThanDocComments(file: string, source: ts.SourceFile): string[] {
  return commentsIn(source)
    .filter(({ text }) => !text.startsWith("/**"))
    .map(({ pos, text }) => `${file}:${lineOf(source, pos)}: ${text.split("\n")[0]}`);
}

function moduleSpecifierOf(node: ts.Node): ts.Node | undefined {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return node.moduleSpecifier;
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
    return node.argument.literal;
  const loadsAModule =
    ts.isCallExpression(node) &&
    (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      node.expression.getText() === "require");
  return loadsAModule ? node.arguments[0] : undefined;
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
    'import { parse } from "../scripts/syntax";',
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

type Installed = { name: string; version: string };

function installedVersions(names: readonly string[]): Installed[] {
  const answer = execFileSync(installedVp, ["why", ...names, "-r", "--json"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: packAnswerTimeout,
  });
  const installed: unknown = JSON.parse(answer);
  if (!Array.isArray(installed)) throw new Error(`The package manager answered: ${answer}`);
  return installed.map(({ name, version }: Installed) => ({ name, version }));
}

test("every package of a Solid release is installed at the version the catalog pins, wherever it is installed", () => {
  const { catalog } = pnpmSettings();
  const installed = installedVersions(solidPackages);
  const [first = ""] = solidPackages;
  const violations = [
    ...solidPackages
      .filter((name) => catalog[name] !== catalog[first])
      .map(
        (name) =>
          `${workspaceFile}: pin ${name} to ${catalog[first] ?? "the release"} ${first} is pinned to, not ${catalog[name] ?? "nothing"}: the packages of a Solid release move together.`,
      ),
    ...solidPackages
      .filter((name) => !installed.some((each) => each.name === name))
      .map((name) => `${name} is not installed, so nothing tells which release it is.`),
    ...installed
      .filter(({ name, version }) => version !== catalog[name])
      .map(
        ({ name, version }) =>
          `${name} is installed at ${version}, not ${catalog[name] ?? "a version"} the catalog in ${workspaceFile} pins. Pin it in the catalog and override it there with "catalog:", so a package that brings it in cannot hold an older release.`,
      ),
  ];

  expect(violations).toEqual([]);
});

test("every peer range of a library package accepts the version the catalog pins", () => {
  const { catalog } = pnpmSettings();
  const violations = libraryPackages.flatMap(({ path, manifest }) =>
    Object.entries(manifest.peerDependencies ?? {}).flatMap(([name, range]) => {
      if (libraryNames.includes(name)) return [];
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
