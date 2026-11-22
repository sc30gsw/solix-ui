import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, expect, test } from "vite-plus/test";
import {
  descendants,
  exportsOf,
  fileOf,
  findAncestor,
  isFileOfPackage,
  isTypedAny,
  memberDeclarations,
  memberRead,
  nameOf,
  openProgram,
  propertyDeclarations,
  parse,
  parseAll,
  type Program,
  virtualFile,
  ts,
} from "#/scripts/syntax.ts";
import { anyFreePort } from "#/tests/support/server-process.ts";
import { repositoryRoot } from "#/tests/support/workspace.ts";

const servedPageSkill = ".agents/skills/verify-served-page";
const portHolders = [
  "vite.config.ts",
  "e2e.config.ts",
  "{tests,packages/*/tests,apps/*/tests}/**/*.{ts,tsx,mjs}",
  "apps/*/*.ts",
  "apps/*/.storybook/*.ts",
  "apps/*/fixtures/**/*.ts",
];
const portTexts = [`${servedPageSkill}/**/*.md`];
const setupsModules = "apps/playground/src/sections/*-setups.ts";
const namesObject = /Names$/;
const letterOrDigit = /[\p{L}\p{N}]/u;
const whitespace = /\s/;
const derivingFunctions = ["panelOf", "valueOf"];
const playgroundTestCode = "apps/playground/tests/**/*.{ts,tsx,mjs}";
const playgroundVerificationFiles = globSync(
  [playgroundTestCode, "tests/support/served-app.ts", "scripts/expected-values.ts"],
  { cwd: repositoryRoot },
).sort();
const openingModule = "apps/playground/tests/support/opening.ts";
const opener = "opened";
const navigation = "goto";
const playwrightPackages = ["playwright", "playwright-core"];
const portName = /port/i;
const portNumbers = { lowest: 1024, highest: 65_535 };
const listenCall = /\blisten$/;
const portInCode = /127\.0\.0\.1:(\d+)|--port[= ]["'`]?(\d+)|\bPORT[=:]\s*["'`]?(\d+)/g;
const portInScriptsAndDocs =
  /(?:127\.0\.0\.1|localhost):(\d+)|--port[= ]["'`]?(\d+)|\bPORT[=:]\s*["'`]?(\d+)|_PORT:-(\d+)/g;

function read(path: string): string {
  return readFileSync(join(repositoryRoot, path), "utf8");
}

function namesAPort(name: ts.Node): boolean {
  return portName.test(name.getText());
}

function holdsAPort(literal: ts.NumericLiteral): boolean {
  const value = Number(literal.text);
  if (!Number.isInteger(value) || value < portNumbers.lowest || value > portNumbers.highest)
    return false;
  const holder = literal.parent;
  if (ts.isCallExpression(holder)) {
    return holder.arguments.includes(literal) && listenCall.test(holder.expression.getText());
  }
  if (
    ts.isVariableDeclaration(holder) ||
    ts.isPropertyAssignment(holder) ||
    ts.isParameterDeclaration(holder) ||
    ts.isBindingElement(holder)
  ) {
    return holder.name !== undefined && namesAPort(holder.name);
  }
  return false;
}

function portsIn(source: ts.SourceFile): string[] {
  const found = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isNumericLiteral(node) && holdsAPort(node)) found.add(String(Number(node.text)));
    node.forEachChild(visit);
  };
  visit(source);
  return [...found];
}

function portsWrittenIn(text: string, written: RegExp): string[] {
  return [...text.matchAll(written)]
    .map((match) => match.slice(1).find((port) => port !== undefined) ?? "")
    .filter((port) => Number(port) >= portNumbers.lowest);
}

test("no test server, test configuration or document of the served-page skill names a fixed port: each listens on a port the system gives it, so two runs never meet", () => {
  const codePaths = globSync(portHolders, { cwd: repositoryRoot }).sort();
  const sources = parseAll(codePaths.map((path) => join(repositoryRoot, path)));
  const textPaths = globSync(portTexts, { cwd: repositoryRoot }).sort();
  const violations = [
    ...codePaths.flatMap((path, index) => portsIn(sources[index]).map((port) => ({ path, port }))),
    ...codePaths.flatMap((path) =>
      portsWrittenIn(read(path), portInCode).map((port) => ({ path, port })),
    ),
    ...textPaths.flatMap((path) =>
      portsWrittenIn(read(path), portInScriptsAndDocs).map((port) => ({ path, port })),
    ),
  ].map(
    ({ path, port }) =>
      `${path}: port ${port} is fixed. Listen on port ${anyFreePort} through startServer, listening or viteOnAFreePort, and read the port the server got.`,
  );

  expect(codePaths.length).toBeGreaterThan(0);
  expect(textPaths.length).toBeGreaterThan(0);
  expect([...new Set(violations)]).toEqual([]);
});

type HeldName = { name: string; module: string };

function stringLeaves(value: unknown): string[] {
  if (typeof value === "string") return [value];
  return typeof value === "object" && value !== null
    ? Object.values(value).flatMap(stringLeaves)
    : [];
}

async function namesTheSetupsHold(): Promise<HeldName[]> {
  const modules = globSync(setupsModules, { cwd: repositoryRoot });
  const held = await Promise.all(
    modules.map(async (module) => {
      const { functions, others } = exportsOf(parse(join(repositoryRoot, module)));
      const declared = [...functions, ...others];
      const exported = Object.fromEntries(
        Object.entries(
          (await import(join(repositoryRoot, module))) as Record<string, unknown>,
        ).filter(([name]) => declared.includes(name)),
      );
      const listNames = Object.values(exported).flatMap((value) =>
        typeof value === "string" ? [value] : [],
      );
      const itemNames = Object.entries(exported).flatMap(([name, value]) =>
        namesObject.test(name) ? stringLeaves(value) : [],
      );
      const derived = Object.entries(exported).flatMap(([name, derive]) =>
        derivingFunctions.includes(name) && typeof derive === "function"
          ? itemNames.map((item) => String(derive(item)))
          : [],
      );
      return [...listNames, ...itemNames, ...derived].map((name) => ({ name, module }));
    }),
  );
  return held.flat();
}

function holdsAsAWord(text: string, name: string): boolean {
  const at = text.indexOf(name);
  if (at === -1) return false;
  const before = text.slice(0, at).at(-1) ?? " ";
  const after = text.at(at + name.length) ?? " ";
  return (
    (!letterOrDigit.test(before) && !letterOrDigit.test(after)) ||
    holdsAsAWord(text.slice(at + 1), name)
  );
}

function heldIn(node: ts.Node, held: HeldName[]): HeldName | undefined {
  if (ts.isRegularExpressionLiteral(node)) {
    return held.find(({ name }) => holdsAsAWord(node.text, name));
  }
  const text =
    ts.isStringLiteralLikeNode(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
      ? node.text
      : undefined;
  if (text === undefined) return undefined;
  return held.find(
    ({ name }) => name === text || (!whitespace.test(text) && holdsAsAWord(text, name)),
  );
}

test("no playground test or helper they share writes a name that a setups module holds, a list's name, an item's name in an exported *Names object, or what its panelOf or valueOf gives for an item, as a string, as a word of a string with no whitespace, or as a word of a regular expression: each reads it from that module", async () => {
  const held = await namesTheSetupsHold();
  const violations = playgroundVerificationFiles.flatMap((file) => {
    const source = parse(join(repositoryRoot, file));
    return descendants(source).flatMap((node) => {
      const found = heldIn(node, held);
      return found
        ? [
            `${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${node.getText()} holds ${JSON.stringify(found.name)}, a name ${found.module} holds. Read it from that module.`,
          ]
        : [];
    });
  });

  expect(held).not.toEqual([]);
  expect(violations).toEqual([]);
});

function isPlaywrightsNavigation(declaration: ts.Node): boolean {
  return (
    isFileOfPackage(fileOf(declaration), playwrightPackages) && nameOf(declaration) === navigation
  );
}

function readsAnIndex(node: ts.Node): boolean {
  return ts.isElementAccessExpression(node) && ts.isNumericLiteral(node.argumentExpression);
}

type PageRead = { kind: "none" } | { kind: "names"; names: string[] } | { kind: "unknown" };

function readFromAPage(program: Program, node: ts.Node): PageRead {
  const read = memberRead(program, node);
  if (!read || readsAnIndex(node)) return { kind: "none" };
  const aPage =
    isTypedAny(program, read.owner) ||
    propertyDeclarations(program, read.owner, [navigation]).some(isPlaywrightsNavigation);
  if (!aPage) return { kind: "none" };
  return read.names.length === 0 ? { kind: "unknown" } : { kind: "names", names: read.names };
}

function insideTheOpener(node: ts.Node): boolean {
  if (!fileOf(node).endsWith(openingModule)) return false;
  const owner = findAncestor(node, ts.isFunctionDeclaration);
  return owner !== undefined && nameOf(owner) === opener && ts.isSourceFile(owner.parent);
}

type Navigation = { node: ts.Node; how: string };

function navigationsInSource(program: Program, source: ts.SourceFile): Navigation[] {
  return descendants(source).flatMap((node) => {
    if (memberDeclarations(program, node).some(isPlaywrightsNavigation)) {
      return [{ node, how: `reaches Playwright's ${navigation}` }];
    }
    const read = readFromAPage(program, node);
    if (read.kind === "names" && read.names.includes(navigation)) {
      return [{ node, how: `reads ${navigation} from a value typed any` }];
    }
    return read.kind === "unknown"
      ? [
          {
            node,
            how: "reads a member of a page, or of a value typed any, by a name the type checker does not know",
          },
        ]
      : [];
  });
}

function navigationsIn(program: Program, file: string): Navigation[] {
  const source = program.sourceFile(join(repositoryRoot, file));
  if (!source) throw new Error(`${file}: TypeScript did not open this file.`);
  return navigationsInSource(program, source);
}

function lineOf(node: ts.Node): number {
  return node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1;
}

const opening = openProgram(playgroundVerificationFiles.map((file) => join(repositoryRoot, file)));
afterAll(() => {
  opening.dispose();
});

test(`no playground test or helper they share reaches Playwright's ${navigation} but through ${opener}, by a member the type checker resolves or by a member of a value typed any, named or not`, () => {
  const violations = playgroundVerificationFiles.flatMap((file) =>
    navigationsIn(opening, file)
      .filter(({ node }) => !insideTheOpener(node))
      .map(
        ({ node, how }) =>
          `${file}:${lineOf(node)}: ${node.getText()} ${how}. Open the page with ${opener} from ${openingModule}.`,
      ),
  );

  expect(playgroundVerificationFiles).toEqual(expect.arrayContaining([openingModule]));
  expect(
    navigationsIn(opening, openingModule).filter(({ node }) => insideTheOpener(node)),
  ).not.toEqual([]);
  expect(violations).toEqual([]);
});

const pageSpellings = (body: string) =>
  virtualFile(
    `import type { Page } from "playwright";\nexport async function read(page: Page, member: string): Promise<unknown> {\n  ${body}\n}\n`,
    ".ts",
  );
const refusedPageReads = {
  "an element access by a name the type checker does not know": "return page[member];",
  "Reflect.get by a name the type checker does not know": "return Reflect.get(page, member);",
  "goto by its literal name": 'return page["goto"];',
};
const allowedPageReads = {
  "a member read by its name": "return page.url();",
  "a member read by a literal name": 'return page["title"]();',
};
const pageReadFiles = Object.fromEntries(
  Object.entries({ ...refusedPageReads, ...allowedPageReads }).map(([spelling, body]) => [
    spelling,
    pageSpellings(body),
  ]),
);
const pageReads = openProgram(Object.values(pageReadFiles));
afterAll(() => {
  pageReads.dispose();
});

function navigationsInFixture(spelling: string): Navigation[] {
  const source = pageReads.sourceFile(pageReadFiles[spelling]);
  if (!source) throw new Error(`${spelling}: TypeScript did not open its fixture.`);
  return navigationsInSource(pageReads, source);
}

test.for(Object.keys(refusedPageReads))("on a typed page, the check refuses %s", (spelling) => {
  expect(navigationsInFixture(spelling)).not.toEqual([]);
});

test.for(Object.keys(allowedPageReads))("on a typed page, the check passes %s", (spelling) => {
  expect(navigationsInFixture(spelling)).toEqual([]);
});
