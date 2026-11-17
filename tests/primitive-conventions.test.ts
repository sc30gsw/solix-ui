import { existsSync, globSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { afterAll, expect, test } from "vite-plus/test";
import {
  loadLibrary,
  primitiveRules,
  type PrimitiveRuleName,
  publicModules,
} from "#/tests/support/primitive-rules/index.ts";
import { fileNamedBy, namesAPackage } from "#/scripts/subpath.ts";
import { importsOf, isTypeOnlyImport, parse, ts } from "#/scripts/syntax.ts";
import { primitivesPackage, repositoryRoot } from "#/tests/support/workspace.ts";

const fixtureDirectory = join(repositoryRoot, "tests/fixtures/primitive-rules");
const viteConfig = "vite.config.ts";
const preBundledName = "preBundledForBrowserTests";
const browserTests = "packages/primitives/tests/**/*.browser.test.{ts,tsx}";
const servedByVitestOrTheSolidPlugin = ["vite-plus/test", "solid-js", "@solidjs/web"];

const library = loadLibrary(primitivesPackage.directory);
afterAll(library.dispose);

test("the primitives package has public modules to check", () => {
  expect(publicModules(library)).not.toEqual([]);
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
  publicExports: [
    forbiddenAt("src/get-other.ts"),
    forbiddenAt("src/create-relayed.ts", "export function createRelayed"),
  ],
  barrelOrder: [forbiddenAt("src/index.ts")],
  serverEffects: [
    forbiddenAt("src/create-forbidden.ts", "import { createRenderEffect }"),
    forbiddenAt("src/create-forbidden.ts", "  createRenderEffect("),
    forbiddenAt("src/create-forbidden.ts", 'solid["createRenderEffect"]'),
    forbiddenAt("src/create-forbidden.ts", "solid[effectName]"),
  ],
  serverBranches: [
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
    forbiddenAt("src/create-ref.ts", "const current = createMemo"),
    forbiddenAt("src/create-ref.ts", "createEffect(current"),
    forbiddenAt("src/create-sized.ts", "export function createSized"),
    forbiddenAt("src/create-sized.ts", "const width = createMemo"),
    forbiddenAt("src/create-sized.ts", "const [height] = createSignal"),
  ],
  browserValues: [
    forbiddenAt("src/create-unbranded.ts", "export function createUnbranded"),
    forbiddenAt("src/create-relayed.ts", "export function createRelayed"),
    forbiddenAt("src/create-misbehaving.ts", "export function createMisbehaving"),
  ],
  browserValueAssertions: [
    forbiddenAt("src/create-branded.ts", "as BrowserValue<number>,"),
    forbiddenAt("src/create-branded.ts", "as never"),
    forbiddenAt("src/create-branded.ts", "as Live<number>"),
    forbiddenAt("src/create-branded.ts", "as unknown as BrowserValue<number>"),
  ],
  hydrationPolicy: [
    forbiddenAt("src/create-misbehaving.ts", "ssrSource"),
    forbiddenAt("src/create-misbehaving.ts", "from<number>"),
  ],
  browserGlobalReads: [
    forbiddenAt("src/create-forbidden.ts", "const inBrowser"),
    forbiddenAt("src/create-forbidden.ts", "const inBrowser"),
    forbiddenAt("src/create-forbidden.ts", "document.adoptedStyleSheets"),
    forbiddenAt("src/create-forbidden.ts", 'document.createElement("style")'),
    forbiddenAt("src/create-misbehaving.ts", "const width = window"),
    forbiddenAt("src/create-misbehaving.ts", "new ResizeObserver"),
    forbiddenAt("src/create-misbehaving.ts", "const Observer"),
    forbiddenAt("src/create-misbehaving.ts", "const viaWindow"),
    forbiddenAt("src/create-misbehaving.ts", "instanceof Element"),
    forbiddenAt("src/create-misbehaving.ts", "const later"),
  ],
  commandKinds: [
    forbiddenAt("src/create-commanded.ts", "createStateCommand(() => window"),
    forbiddenAt("src/create-commanded.ts", "createStateCommand(() => home()"),
    forbiddenAt("src/create-commanded.ts", "createStateCommand(() => verticalOffset()"),
    forbiddenAt("src/create-commanded.ts", "createStateCommand(() => Page.top()"),
    forbiddenAt("src/create-commanded.ts", "createStateCommand(() => new Page().left"),
  ],
  liveOptions: [
    forbiddenAt("src/create-misbehaving.ts", "const size = access"),
    forbiddenAt("src/create-misbehaving.ts", "(deliver) => deliver(window.matchMedia"),
  ],
  listenerRoles: [
    forbiddenAt("src/create-misbehaving.ts", "element.addEventListener"),
    forbiddenAt("src/create-misbehaving.ts", 'listenerSettings("ping")'),
    forbiddenAt("src/create-misbehaving.ts", "return listen("),
    forbiddenAt("src/create-respelled.ts", 'browserMethod(window, "addEventListener")'),
    forbiddenAt("src/create-respelled.ts", "const { removeEventListener: stop }"),
    forbiddenAt("src/create-respelled.ts", 'window["addEventListener"]'),
  ],
  eventHandlerProperties: [
    forbiddenAt("src/create-misbehaving.ts", "element.onfocus"),
    forbiddenAt("src/create-misbehaving.ts", 'Reflect.set(element, "onblur"'),
    forbiddenAt("src/create-respelled.ts", 'lookUp(element, "onclick")'),
    forbiddenAt("src/create-respelled.ts", "const { onkeydown }"),
    forbiddenAt("src/create-respelled.ts", 'element["onkeyup"]'),
  ],
  observerConstruction: [
    forbiddenAt("src/create-misbehaving.ts", "new ResizeObserver"),
    forbiddenAt("src/create-misbehaving.ts", "const Observer"),
    forbiddenAt("src/create-misbehaving.ts", "const viaWindow"),
    forbiddenAt("src/create-respelled.ts", 'lookUp(window, "ResizeObserver")'),
    forbiddenAt("src/create-respelled.ts", "const { MutationObserver: Watcher }"),
    forbiddenAt("src/create-respelled.ts", 'window["IntersectionObserver"]'),
  ],
  caughtErrors: [forbiddenAt("src/create-misbehaving.ts", "} catch {")],
  instanceofChecks: [forbiddenAt("src/create-misbehaving.ts", "instanceof Element")],
  focusMoves: [
    forbiddenAt("src/create-forbidden.ts", "element.focus()"),
    forbiddenAt("src/internal-focus.ts", "target.focus({ preventScroll: true })"),
    forbiddenAt("src/create-respelled.ts", 'element["focus"]()'),
    forbiddenAt("src/create-respelled.ts", "const { focus } = element"),
    forbiddenAt("src/create-respelled.ts", 'browserMethod(element, "focus")'),
    forbiddenAt("src/create-respelled.ts", 'Reflect.get(element, "focus")'),
    forbiddenAt("src/create-respelled.ts", 'Reflect["get"](element, "focus")'),
    forbiddenAt("src/create-respelled.ts", '(0, Reflect.get)(element, "focus")'),
    forbiddenAt("src/create-respelled.ts", 'read(element, "focus")'),
    forbiddenAt("src/create-respelled.ts", 'bound(element, "focus")'),
    forbiddenAt("src/create-respelled.ts", 'pick(element, "focus")'),
    forbiddenAt("src/create-respelled.ts", 'lookUp(...[element], "focus")'),
    forbiddenAt("src/create-respelled.ts", "Reflect.apply(element.focus"),
  ],
  testsNamedForModules: [
    forbiddenAt("src/create-forbidden.ts"),
    forbiddenAt("src/get-other.ts"),
    forbiddenAt("src/internal-trap.ts"),
  ],
  modelTests: [forbiddenAt("src/create-modelled.ts"), forbiddenAt("src/create-folded.ts")],
  browserTestWaits: [
    located("forbidden", "tests/create-misbehaving.browser.test.ts", "{ timeout: 2_000 }"),
    located("forbidden", "tests/create-misbehaving.browser.test.ts", "(resolve) => setTimeout"),
    located("forbidden", "tests/create-misbehaving.browser.test.ts", "toBeGreaterThan(0)"),
    located("forbidden", "tests/create-misbehaving.browser.test.ts", "window.setTimeout"),
    located("forbidden", "tests/create-misbehaving.browser.test.ts", "toBeGreaterThanOrEqual"),
    located("forbidden", "tests/create-misbehaving.browser.test.ts", "seen.length >= 1"),
    located("forbidden", "tests/create-misbehaving.browser.test.ts", "const { setTimeout: later"),
    located("forbidden", "tests/create-misbehaving.browser.test.ts", "const { setTimeout: later"),
    located("forbidden", "tests/create-misbehaving.browser.test.ts", "Reflect.apply(setTimeout"),
    located("forbidden", "tests/create-misbehaving.browser.test.ts", 'window["setTimeout"]'),
    located(
      "forbidden",
      "tests/create-misbehaving.browser.test.ts",
      'lookUp(window, "setTimeout")',
    ),
    located(
      "forbidden",
      "tests/create-misbehaving.browser.test.ts",
      'Reflect["get"](window, "setInterval")',
    ),
    located(
      "forbidden",
      "tests/create-misbehaving.browser.test.ts",
      '(0, lookUp)(window, "setInterval")',
    ),
    located("forbidden", "tests/create-misbehaving.browser.test.ts", 'read(window, "setTimeout")'),
  ],
  accessibilityTests: [forbiddenAt("src/create-modelled.ts")],
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
  fixture.dispose();

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
  fixture.dispose();
  const expected = Object.fromEntries(
    Object.entries(forbiddenFindings).map(([name, locations]) => [name, [...locations].sort()]),
  );

  expect(findings).toEqual(expected);
});

function preBundledInConfig(): string[] {
  const path = join(repositoryRoot, viteConfig);
  const source = parse(path);
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
    const source = parse(file);
    for (const { specifier, node } of importsOf(source)) {
      if (isTypeOnlyImport(node.importClause)) continue;
      const target = fileNamedBy(file, specifier);
      if (namesAPackage(specifier)) bare.add(specifier);
      else if (target && existsSync(target)) queue.push(target);
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
