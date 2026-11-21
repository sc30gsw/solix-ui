import { existsSync, globSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { afterAll, expect, test } from "vite-plus/test";
import { layoutReadsRuleWith } from "#/tests/support/primitive-rules/layout-reads.ts";
import {
  loadLibrary,
  primitiveRules,
  type PrimitiveRuleName,
  publicModules,
  rulesOfKind,
} from "#/tests/support/primitive-rules/index.ts";
import { fileNamedBy, namesAPackage } from "#/scripts/subpath.ts";
import { importsOf, isTypeOnlyImport, parse, ts } from "#/scripts/syntax.ts";
import {
  type Home,
  libraryKindNames,
  libraryKinds,
  type LibraryRegistration,
  libraryPackages,
  repositoryRoot,
} from "#/tests/support/workspace.ts";

const fixtureDirectory = join(repositoryRoot, "tests/fixtures/primitive-rules");
const fixtureRegistration: LibraryRegistration = { kind: "primitives", errorBoundaries: [] };
const logicRegistration: LibraryRegistration = { kind: "logic", errorBoundaries: [] };
const viteConfig = "vite.config.ts";
const preBundledName = "preBundledForBrowserTests";
const browserTests = "packages/primitives/tests/**/*.browser.test.{ts,tsx}";
const servedByVitestOrTheSolidPlugin = ["vite-plus/test", "solid-js", "@solidjs/web"];

const checked = libraryPackages
  .filter(({ kind }) => rulesOfKind(kind).length > 0)
  .map(({ directory, kind, errorBoundaries }) => ({
    name: relative(repositoryRoot, directory),
    kind,
    library: loadLibrary(directory, { kind, errorBoundaries }),
  }));
afterAll(() => {
  for (const { library } of checked) library.dispose();
});

test("these rules skip only a library of a kind libraryKinds gives no rule, the components kind, which the component contract checks instead", () => {
  expect(libraryKindNames.filter((kind) => rulesOfKind(kind).length === 0)).toEqual(["components"]);
  expect(libraryKinds.components.rules).toBe("none");
  expect(
    libraryPackages.filter(({ kind }) => rulesOfKind(kind).length === 0).map(({ kind }) => kind),
  ).toEqual(["components"]);
});

test.each(checked)(
  "$name, a library of the $kind kind, has public modules to check",
  ({ library }) => {
    expect(publicModules(library)).not.toEqual([]);
  },
);

test.each(
  checked.flatMap(({ name, kind, library }) =>
    rulesOfKind(kind).map((rule) => ({ name, library, ...primitiveRules[rule] })),
  ),
)("$name: $description", ({ library, rule }) => {
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
    forbiddenAt("src/constants.ts"),
    forbiddenAt("src/constants.ts"),
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
  layoutReads: [
    forbiddenAt("src/create-commanded.ts", "return window.scrollY"),
    forbiddenAt("src/create-commanded.ts", "return window.scrollX"),
    forbiddenAt("src/internal-position.ts", "return window.scrollY"),
    forbiddenAt("src/internal-position.ts", "return this.element.clientHeight"),
    forbiddenAt("src/internal-position.ts", "return element.scrollTop"),
    forbiddenAt("src/create-misbehaving.ts", "const width = window.innerWidth"),
    forbiddenAt("src/create-misbehaving.ts", "window.innerHeight + current"),
    forbiddenAt("src/create-respelled.ts", "return element.checkVisibility()"),
    forbiddenAt("src/create-respelled.ts", "element.getBoundingClientRect()"),
    forbiddenAt("src/create-respelled.ts", "const { offsetWidth }"),
    forbiddenAt("src/create-respelled.ts", 'lookUp(window, "scrollY")'),
    forbiddenAt("src/create-respelled.ts", "getComputedStyle(element)"),
    forbiddenAt("src/create-respelled.ts", "handlerFor(element.getClientRects().length)"),
    forbiddenAt("src/create-respelled.ts", "(void element.offsetHeight, () => undefined)"),
    forbiddenAt("src/create-respelled.ts", "(element.scrollLeft)"),
    forbiddenAt("src/create-respelled.ts", ".getBBox()"),
    forbiddenAt("src/create-respelled.ts", "element.computedStyleMap()"),
    forbiddenAt("src/create-respelled.ts", "document.elementFromPoint(0, 0)"),
    forbiddenAt("src/create-respelled.ts", "element.innerText"),
    forbiddenAt("src/create-respelled.ts", "window.visualViewport"),
    forbiddenAt("src/create-respelled.ts", '"clientHeight")'),
    forbiddenAt("src/create-respelled.ts", "return () => element.offsetLeft"),
    forbiddenAt("src/create-respelled.ts", "strings.length + element.clientTop"),
    forbiddenAt("src/create-respelled.ts", "=> target.scrollWidth"),
    forbiddenAt("src/create-respelled.ts", "=> target.scrollHeight"),
    forbiddenAt("src/create-respelled.ts", "=> target.offsetTop"),
    forbiddenAt("src/create-respelled.ts", "=> target.clientLeft"),
    forbiddenAt("src/create-respelled.ts", "=> target.offsetParent"),
    forbiddenAt("src/create-respelled.ts", "() => window.pageXOffset"),
    forbiddenAt("src/create-respelled.ts", "value + window.pageYOffset"),
    forbiddenAt("src/create-respelled.ts", "document.scrollingElement?.scrollTop"),
    forbiddenAt("src/create-respelled.ts", "documentElement.clientWidth)()"),
    forbiddenAt("src/create-respelled.ts", "parentElement?.offsetHeight"),
    forbiddenAt("src/create-respelled.ts", "document.body.scrollLeft"),
    forbiddenAt("src/create-respelled.ts", "=> target.scrollWidth + 1"),
    forbiddenAt("src/create-respelled.ts", "=> target.offsetTop + 1"),
    forbiddenAt("src/create-respelled.ts", "=> target.offsetLeft + 1"),
    forbiddenAt("src/create-respelled.ts", "element.clientHeight + 1"),
    forbiddenAt("src/create-respelled.ts", "element.scrollTop + 1"),
    forbiddenAt("src/create-respelled.ts", "element.clientWidth + 1"),
    forbiddenAt("src/create-respelled.ts", "element.offsetHeight + 1"),
    forbiddenAt("src/create-respelled.ts", "element.offsetWidth + 1"),
    forbiddenAt("src/create-respelled.ts", "element.scrollHeight + 1"),
    forbiddenAt("src/create-respelled.ts", "element.scrollLeft + 1"),
    forbiddenAt("src/create-respelled.ts", "return element.clientTop + 1"),
    forbiddenAt("src/create-respelled.ts", "return element.clientLeft + 1"),
    forbiddenAt("src/create-respelled.ts", "target.getClientRects().length + 1"),
    forbiddenAt("src/create-respelled.ts", "element.clientTop + 2"),
    forbiddenAt("src/create-respelled.ts", "element.clientLeft + 2"),
    forbiddenAt("src/create-respelled.ts", 'heard(new Event("now"))'),
    forbiddenAt("src/create-respelled.ts", 'handlers.scroll(new Event("wired"))'),
    forbiddenAt("src/create-respelled.ts", 'this.heard(new Event("fired"))'),
    forbiddenAt("src/create-respelled.ts", "return (event) => heard(event)"),
    forbiddenAt("src/create-respelled.ts", "later(event)"),
    forbiddenAt("src/internal-position.ts", "  saved = heard"),
    forbiddenAt("src/internal-position.ts", "const boxed = { heard }"),
    forbiddenAt("src/create-respelled.ts", "element.offsetTop + 3"),
    forbiddenAt("src/create-respelled.ts", "element.offsetLeft + 3"),
    forbiddenAt("src/create-respelled.ts", "element.offsetWidth + 3"),
    forbiddenAt("src/create-respelled.ts", "element.clientTop + 3"),
    forbiddenAt("src/create-respelled.ts", "element.clientLeft + 3"),
    forbiddenAt("src/create-respelled.ts", "element.scrollTop + 3"),
    forbiddenAt("src/create-respelled.ts", "element.offsetWidth + 4"),
    forbiddenAt("src/create-respelled.ts", "element.clientHeight + 4"),
    forbiddenAt("src/internal-position.ts", "  fireAll(handlers);"),
    forbiddenAt("src/create-respelled.ts", "element.scrollWidth + 4"),
    forbiddenAt("src/internal-position.ts", "handlers[scrollKey]"),
    forbiddenAt("src/create-respelled.ts", "element.offsetLeft + 4"),
    forbiddenAt("src/create-respelled.ts", "element.clientTop + 4"),
    forbiddenAt("src/create-respelled.ts", "element.clientLeft + 4"),
    forbiddenAt("src/create-modelled.ts", "element.clientHeight"),
    forbiddenAt("src/internal-position.ts", "element.scrollTop + 6"),
    forbiddenAt("src/internal-position.ts", "element.offsetTop + 6"),
    forbiddenAt("src/internal-position.ts", "element.offsetLeft + 6"),
    forbiddenAt("src/internal-position.ts", "this.width = element.offsetWidth * 2"),
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
  const fixture = loadLibrary(join(fixtureDirectory, "allowed"), fixtureRegistration);
  const findings = Object.fromEntries(
    Object.entries(primitiveRules).map(([name, { rule }]) => [name, rule(fixture)]),
  );
  fixture.dispose();

  expect(findings).toEqual(
    Object.fromEntries(Object.keys(primitiveRules).map((name) => [name, []])),
  );
});

function caughtErrorsWith(errorBoundaries: readonly Required<Home>[]): string[] {
  const fixture = loadLibrary(join(fixtureDirectory, "forbidden"), {
    kind: "primitives",
    errorBoundaries,
  });
  const found = primitiveRules.caughtErrors.rule(fixture);
  fixture.dispose();
  return locationsOf(found);
}

test("the layout-reads rule stops at a function an exemption names, so no read in it or in what it calls is flagged, and flags an exemption whose function reads no layout as a primitive goes live", () => {
  const fixture = loadLibrary(join(fixtureDirectory, "forbidden"), fixtureRegistration);
  const found = layoutReadsRuleWith([
    { file: "create-respelled.ts", fn: "shown", reason: "reads only at the moment of use" },
    { file: "create-respelled.ts", fn: "handlerFor", reason: "reads only at the moment of use" },
  ]).rule(fixture);
  fixture.dispose();

  expect(locationsOf(found).sort()).toEqual(
    [
      ...forbiddenFindings.layoutReads.filter(
        (location) =>
          location !== forbiddenAt("src/create-respelled.ts", "return element.checkVisibility()"),
      ),
      "create-respelled.ts",
    ].sort(),
  );
  expect(found.find((finding) => finding.startsWith("create-respelled.ts: "))).toBe(
    "create-respelled.ts: handlerFor reads no layout as a primitive goes live, so drop its entry from layoutReadExemptions.",
  );
});

test("the caught errors rule passes an error boundary that catches, and flags one that is missing or holds no catch", () => {
  const catching = { file: "create-misbehaving.ts", fn: "createMisbehaving" };

  expect(caughtErrorsWith([catching])).toEqual([]);
  expect(
    caughtErrorsWith([
      catching,
      { file: "create-gone.ts", fn: "createGone" },
      { file: "create-sized.ts", fn: "createSized" },
    ]),
  ).toEqual([forbiddenAt("src/create-gone.ts"), forbiddenAt("src/create-sized.ts")]);
});

test("the rules of the logic kind read a logic fixture with Node's types, so a global Node declares too is no browser-only read", () => {
  const asLogic = loadLibrary(join(fixtureDirectory, "logic"), logicRegistration);
  const findings = Object.fromEntries(
    rulesOfKind("logic").map((name) => [name, primitiveRules[name].rule(asLogic)]),
  );
  asLogic.dispose();
  const asPrimitives = loadLibrary(join(fixtureDirectory, "logic"), fixtureRegistration);
  const withoutNodeTypes = primitiveRules.browserGlobalReads.rule(asPrimitives);
  asPrimitives.dispose();

  expect(findings).toEqual(Object.fromEntries(rulesOfKind("logic").map((name) => [name, []])));
  expect(locationsOf(withoutNodeTypes)).toEqual([
    located("logic", "src/get-abort-signal.ts", "new AbortController()"),
  ]);
});

test("each rule flags every line of a fixture that breaks it, and nothing else", () => {
  const fixture = loadLibrary(join(fixtureDirectory, "forbidden"), fixtureRegistration);
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
      else {
        const found = target && [target, `${target}.ts`, `${target}.tsx`].find(existsSync);
        if (found) queue.push(found);
      }
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
