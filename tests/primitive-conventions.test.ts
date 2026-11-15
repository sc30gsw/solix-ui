import { existsSync, globSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { expect, test } from "vite-plus/test";
import {
  loadLibrary,
  primitiveRules,
  type PrimitiveRuleName,
  publicModuleCount,
} from "./support/primitive-rules/index";
import { importsOf } from "./support/syntax";
import { primitivesPackage, repositoryRoot } from "./support/workspace";

const fixtureDirectory = join(repositoryRoot, "tests/fixtures/primitive-rules");
const viteConfig = "vite.config.ts";
const preBundledName = "preBundledForBrowserTests";
const browserTests = "packages/primitives/tests/**/*.browser.test.{ts,tsx}";
const servedByVitestOrTheSolidPlugin = ["vite-plus/test", "solid-js", "@solidjs/web"];

const library = loadLibrary(primitivesPackage.directory);

test("the primitives package has public modules to check", () => {
  expect(publicModuleCount(library)).toBeGreaterThan(0);
});

test.each(Object.values(primitiveRules))("$description", ({ rule }) => {
  expect(rule(library)).toEqual([]);
});

function located(fixture: string, file: string, snippet?: string): string {
  const path = join(fixtureDirectory, fixture, file);
  const shown = relative(repositoryRoot, path);
  if (snippet === undefined) return shown;
  const index = readFileSync(path, "utf8")
    .split("\n")
    .findIndex((line) => line.includes(snippet));
  if (index === -1) throw new Error(`${shown} holds no line with ${snippet}.`);
  return `${shown}:${index + 1}`;
}

function locationsOf(violations: string[]): string[] {
  return violations.map((violation) => /^([^\s:]+(?::\d+)?):/.exec(violation)?.[1] ?? violation);
}

const forbiddenAt = (file: string, snippet?: string) => located("forbidden", file, snippet);

const forbiddenFindings: Record<PrimitiveRuleName, string[]> = {
  sourceFileKinds: [forbiddenAt("src/GetThing.ts"), forbiddenAt("src/notes.md")],
  publicExports: [forbiddenAt("src/get-other.ts")],
  barrelOrder: [forbiddenAt("src/index.ts")],
  serverEffects: [
    forbiddenAt("src/create-forbidden.ts", "import { createRenderEffect }"),
    forbiddenAt("src/create-forbidden.ts", "  createRenderEffect("),
    forbiddenAt("src/create-forbidden.ts", 'solid["createRenderEffect"]'),
    forbiddenAt("src/create-forbidden.ts", "solid[effectName]"),
  ],
  serverBranches: [
    forbiddenAt("src/create-forbidden.ts", "import { isServer }"),
    forbiddenAt("src/create-forbidden.ts", "const onServer = isServer"),
    forbiddenAt("src/create-forbidden.ts", "const inBrowser"),
    forbiddenAt("src/create-forbidden.ts", "const inBrowser"),
    forbiddenAt("src/create-misbehaving.ts", "const known"),
    forbiddenAt("src/create-misbehaving.ts", "const known"),
    forbiddenAt("src/create-misbehaving.ts", "const server"),
  ],
  moduleState: [
    forbiddenAt("src/create-forbidden.ts", "let instances"),
    forbiddenAt("src/create-forbidden.ts", "const cache"),
    forbiddenAt("src/create-forbidden.ts", "const made"),
    forbiddenAt("src/create-forbidden.ts", "const table"),
    forbiddenAt("src/create-forbidden.ts", "const pattern"),
    forbiddenAt("src/create-forbidden.ts", "const list"),
    forbiddenAt("src/create-forbidden.ts", "static entries"),
  ],
  readOnceArguments: [
    forbiddenAt("src/create-forbidden.ts", "const max"),
    forbiddenAt("src/create-forbidden.ts", "value: ReadOnce<number>"),
    forbiddenAt("src/create-forbidden.ts", "initialCount: MaybeAccessor<number>"),
  ],
  argumentReads: [
    forbiddenAt("src/create-forbidden.ts", "{ label }: { label: string }"),
    forbiddenAt("src/create-forbidden.ts", "const step"),
    forbiddenAt("src/create-forbidden.ts", "const alias"),
    forbiddenAt("src/create-forbidden.ts", "const { list: items }"),
    forbiddenAt("src/create-forbidden.ts", "Object.assign({}, options)"),
    forbiddenAt("src/create-forbidden.ts", "[...options.list]"),
    forbiddenAt("src/create-forbidden.ts", "{ ...options }"),
  ],
  styleAndClassWrites: [
    forbiddenAt("src/create-forbidden.ts", "element.className"),
    forbiddenAt("src/create-forbidden.ts", "element.style.color"),
    forbiddenAt("src/create-forbidden.ts", "element.classList.add"),
    forbiddenAt("src/create-forbidden.ts", "element.style.setProperty"),
    forbiddenAt("src/create-forbidden.ts", "Object.assign(element.style"),
    forbiddenAt("src/create-forbidden.ts", 'setAttribute("style"'),
    forbiddenAt("src/create-forbidden.ts", "setAttribute(attribute"),
    forbiddenAt("src/create-forbidden.ts", "adoptedStyleSheets"),
    forbiddenAt("src/create-forbidden.ts", 'createElement("style")'),
  ],
  elementAttachments: [
    forbiddenAt("src/create-ref.ts", "export function createRef"),
    forbiddenAt("src/create-ref.ts", "createEffect,"),
    forbiddenAt("src/create-ref.ts", "createMemo,"),
    forbiddenAt("src/create-sized.ts", "export function createSized"),
    forbiddenAt("src/create-sized.ts", "import { createMemo }"),
    forbiddenAt("src/create-sized.ts", "import { createSignal }"),
  ],
  browserValues: [
    forbiddenAt("src/create-unbranded.ts", "export function createUnbranded"),
    forbiddenAt("src/create-relayed.ts", "export function createRelayed"),
  ],
  browserValueAssertions: [forbiddenAt("src/create-branded.ts", "as BrowserValue<number>")],
  hydrationPolicy: [
    forbiddenAt("src/create-misbehaving.ts", "import { createMemo, from }"),
    forbiddenAt("src/create-misbehaving.ts", "ssrSource"),
  ],
  browserGlobalReads: [
    forbiddenAt("src/create-forbidden.ts", "const inBrowser"),
    forbiddenAt("src/create-forbidden.ts", "const inBrowser"),
    forbiddenAt("src/create-forbidden.ts", "document.adoptedStyleSheets"),
    forbiddenAt("src/create-forbidden.ts", 'document.createElement("style")'),
    forbiddenAt("src/create-misbehaving.ts", "const width = window"),
    forbiddenAt("src/create-misbehaving.ts", "const Observer"),
    forbiddenAt("src/create-misbehaving.ts", "const known"),
  ],
  commandKinds: [
    forbiddenAt("src/create-commanded.ts", "createStateCommand(() => window"),
    forbiddenAt("src/create-commanded.ts", "createStateCommand(() => home()"),
  ],
  liveOptions: [forbiddenAt("src/create-misbehaving.ts", "const size = access")],
  listenerRoles: [
    forbiddenAt("src/create-misbehaving.ts", "import { listen }"),
    forbiddenAt("src/create-misbehaving.ts", "element.addEventListener"),
  ],
  observerConstruction: [
    forbiddenAt("src/create-misbehaving.ts", "new ResizeObserver"),
    forbiddenAt("src/create-misbehaving.ts", "const Observer"),
  ],
  caughtErrors: [forbiddenAt("src/create-misbehaving.ts", "} catch {")],
  instanceofChecks: [forbiddenAt("src/create-misbehaving.ts", "instanceof Element")],
  focusMoves: [
    forbiddenAt("src/create-forbidden.ts", "element.focus()"),
    forbiddenAt("src/internal-focus.ts", "target.focus({ preventScroll: true })"),
  ],
  testsNamedForModules: [
    forbiddenAt("src/create-forbidden.ts"),
    forbiddenAt("src/get-other.ts"),
    forbiddenAt("src/internal-trap.ts"),
  ],
  modelTests: [forbiddenAt("src/create-modelled.ts"), forbiddenAt("src/create-folded.ts")],
  browserTestWaits: [
    located("forbidden", "tests/create-misbehaving.browser.test.ts", "{ timeout: 2_000 }"),
    located("forbidden", "tests/create-misbehaving.browser.test.ts", "setTimeout"),
    located("forbidden", "tests/create-misbehaving.browser.test.ts", "toBeGreaterThan"),
  ],
  accessibilityTests: [forbiddenAt("src/create-modelled.ts"), forbiddenAt("src/create-ref.ts")],
  browserTestsUseTheHarness: [
    forbiddenAt("tests/create-modelled.browser.test.ts"),
    forbiddenAt("tests/create-modelled.browser.test.ts", 'import { flush } from "solid-js"'),
  ],
  serverRenderTest: [forbiddenAt("tests/server-render.test.ts")],
};

test("each rule passes a fixture that holds only what it allows", () => {
  const fixture = loadLibrary(join(fixtureDirectory, "allowed"));
  const findings = Object.fromEntries(
    Object.entries(primitiveRules).map(([name, { rule }]) => [name, rule(fixture)]),
  );

  expect(findings).toEqual(
    Object.fromEntries(Object.keys(primitiveRules).map((name) => [name, []])),
  );
});

test("each rule flags every line of a fixture that breaks it, and nothing else", () => {
  const fixture = loadLibrary(join(fixtureDirectory, "forbidden"));
  const findings = Object.fromEntries(
    Object.entries(primitiveRules).map(([name, { rule }]) => [
      name,
      locationsOf(rule(fixture)).sort(),
    ]),
  );
  const expected = Object.fromEntries(
    Object.entries(forbiddenFindings).map(([name, locations]) => [name, [...locations].sort()]),
  );

  expect(findings).toEqual(expected);
});

function preBundledInConfig(): string[] {
  const path = join(repositoryRoot, viteConfig);
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const declaration = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((found) => ts.isIdentifier(found.name) && found.name.text === preBundledName);
  const initializer = declaration?.initializer;
  if (!initializer || !ts.isArrayLiteralExpression(initializer)) {
    throw new Error(`${viteConfig}: declare ${preBundledName} as an array of package names.`);
  }
  return initializer.elements.flatMap((element) =>
    ts.isStringLiteral(element) ? [element.text] : [],
  );
}

function bareImportsReachedFrom(entries: readonly string[]): string[] {
  const seen = new Set<string>();
  const bare = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop() ?? "";
    if (seen.has(file)) continue;
    seen.add(file);
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    for (const { specifier, node } of importsOf(source)) {
      if (node.importClause?.isTypeOnly) continue;
      if (!specifier.startsWith(".")) {
        bare.add(specifier);
        continue;
      }
      const target = resolve(dirname(file), specifier);
      const found = [`${target}.ts`, `${target}.tsx`].find((candidate) => existsSync(candidate));
      if (found) queue.push(found);
    }
  }
  return [...bare].sort();
}

test(`${preBundledName} in ${viteConfig} names every package the browser tests import that Vitest and the Solid plugin do not serve themselves, and nothing else`, () => {
  const entries = globSync(browserTests, { cwd: repositoryRoot }).map((file) =>
    join(repositoryRoot, file),
  );
  const imported = bareImportsReachedFrom(entries).filter(
    (specifier) => !servedByVitestOrTheSolidPlugin.includes(specifier),
  );

  expect(entries.length).toBeGreaterThan(0);
  expect([...preBundledInConfig()].sort()).toEqual(imported);
});
