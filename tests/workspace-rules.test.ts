import { existsSync, globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import semver from "semver";
import { expect, test } from "vite-plus/test";
import { commentsIn, descendants, parseAll, parseText, ts } from "../scripts/syntax";
import {
  catalogVersions,
  type Manifest,
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
const pnpmSettingsReader = "scripts/pnpm-settings.ts";
const workspaceFileEditor = "scripts/solid-2-canary.ts";
const syntaxModuleImport = /(?:^|\/)syntax(?:\.ts)?$/;
const jobHeader = /^ {2}[\w-]+:$/;
const jobTimeout = /^ {4}timeout-minutes: \d+$/;

function installedDependencies(manifest: Manifest): [string, string][] {
  return Object.entries({ ...manifest.dependencies, ...manifest.devDependencies });
}

function lowestMajorOf(range: string): number | undefined {
  return semver.validRange(range) === null ? undefined : semver.minVersion(range)?.major;
}

function nodeRangeAndLowestMajor(): [string, number] {
  const range = rootManifest.engines?.node;
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

function importsTsFromTheSyntaxModule(source: ts.SourceFile): boolean {
  return source.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      syntaxModuleImport.test(statement.moduleSpecifier.text) &&
      statement.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(statement.importClause.namedBindings) &&
      statement.importClause.namedBindings.elements.some((element) => element.name.text === "ts"),
  );
}

function tsMembersNamedIn(source: ts.SourceFile): { member: string; position: number }[] {
  return descendants(source).flatMap((node) => {
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      return node.expression.text === "ts"
        ? [{ member: node.name.text, position: node.getStart() }]
        : [];
    }
    if (ts.isQualifiedName(node) && ts.isIdentifier(node.left)) {
      return node.left.text === "ts"
        ? [{ member: node.right.text, position: node.getStart() }]
        : [];
    }
    return [];
  });
}

test(`${typeScriptApiList} lists exactly the members of ts the repository names: none missing for a file outside ${typeScriptApiHome}, none unused`, () => {
  const listed = typeScriptApiNames();
  const everySource = parseAll(scriptFiles.map((file) => join(repositoryRoot, file)));
  const named = new Set(everySource.flatMap(tsMembersNamedIn).map(({ member }) => member));
  const unused = listed
    .filter((name) => !named.has(name))
    .map(
      (name) =>
        `${typeScriptApiList}: no file names ts.${name}; remove it from the list, so the list stays what a TypeScript upgrade has to keep working.`,
    );
  const files = scriptFiles.filter((file) => !file.startsWith(typeScriptApiHome));
  const sources = parseAll(files.map((file) => join(repositoryRoot, file)));
  const missing = files.flatMap((file, index) =>
    importsTsFromTheSyntaxModule(sources[index])
      ? tsMembersNamedIn(sources[index])
          .filter(({ member }) => !listed.includes(member))
          .map(
            ({ member, position }) =>
              `${file}:${lineOf(sources[index], position)}: ts.${member} is not in ${typeScriptApiList}. Add it there under its TypeScript 7 name, so the next rename is one alias in that list.`,
          )
      : [],
  );

  expect(listed.length).toBeGreaterThan(10);
  expect([...missing, ...unused]).toEqual([]);
});

function readsOfTheWorkspaceFile(file: string, source: ts.SourceFile): string[] {
  return descendants(source).flatMap((node) => {
    const writesItsName =
      ts.isStringLiteralLikeNode(node) &&
      (node.text === workspaceFile || node.text.endsWith(`/${workspaceFile}`));
    const readsIt =
      ts.isCallExpression(node) &&
      /readFile/.test(node.expression.getText()) &&
      node.arguments.some((argument) => argument.getText().includes("workspaceFile"));
    if (writesItsName && file !== pnpmSettingsReader) {
      return [
        `${file}:${lineOf(source, node.getStart())}: take the name of ${workspaceFile} from ${pnpmSettingsReader}, the one module that names it.`,
      ];
    }
    if (readsIt && file !== workspaceFileEditor) {
      return [
        `${file}:${lineOf(source, node.getStart())}: ${node.getText().split("\n")[0]} reads ${workspaceFile} itself. Take its settings from pnpmSettings() in ${pnpmSettingsReader}, which asks pnpm, so no second parser can disagree with pnpm.`,
      ];
    }
    return [];
  });
}

test(`only ${pnpmSettingsReader} names ${workspaceFile}, and only ${workspaceFileEditor} reads the file itself, to edit it`, () => {
  const sources = parseAll(scriptFiles.map((file) => join(repositoryRoot, file)));
  const violations = scriptFiles.flatMap((file, index) =>
    readsOfTheWorkspaceFile(file, sources[index]),
  );
  const flagged = readsOfTheWorkspaceFile(
    "tests/a-second-parser.ts",
    parseText(
      [
        'const file = "../pnpm-workspace.yaml";',
        'const text = readFileSync(join(repositoryRoot, workspaceFile), "utf8");',
        'const message = "set minimumReleaseAge in pnpm-workspace.yaml";',
      ].join("\n"),
      ".ts",
    ),
  ).map((violation) => /^[^:]+:(\d+):/.exec(violation)?.[1]);

  expect(violations).toEqual([]);
  expect(flagged).toEqual(["1", "2"]);
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

test("every peer range of a library package accepts the version the catalog pins", () => {
  const catalog = catalogVersions();
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

  expect(rootManifest.license, `package.json: set "license" to "${projectLicence}"`).toBe(
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
  const typesRange = catalogVersions()["@types/node"] ?? "";
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
