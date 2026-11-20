import { execFileSync } from "node:child_process";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, test } from "vite-plus/test";
import {
  declarationsOf,
  descendants,
  fileOf,
  firstLine,
  isFileOfPackage,
  isValueReference,
  memberDeclarations,
  moduleSpecifierOf,
  nameOf,
  openProgram,
  type Program,
  propertyDeclarations,
  stringsIn,
  ts,
  virtualFile,
} from "#/scripts/syntax.ts";
import {
  allowedCaptureSpellings,
  captures,
  capturesIn,
  refusedCaptureSpellings,
} from "#/tests/support/image-captures.ts";
import { definePropertyRunnerTests } from "#/tests/support/property-runner-cases.ts";
import { located } from "#/tests/support/primitive-rules/library.ts";
import {
  repositoryRoot,
  scriptFiles,
  scriptFilesInDotDirectories,
} from "#/tests/support/workspace.ts";
import config from "#/vite.config.ts";

type RestrictedImport = { name: string; importNames: string[] };

const restrictedImport = "no-restricted-imports";
const anyScriptFile = /\.[cm]?[jt]sx?$/;
const useTheRunner =
  "run the property with assertProperty from the property runner, which gives it its test's time limit.";

function restrictedRunners(): RestrictedImport {
  const rule: unknown = config.lint?.rules?.[restrictedImport];
  const options: unknown = Array.isArray(rule) ? rule[1] : undefined;
  const paths: unknown =
    typeof options === "object" && options !== null ? Reflect.get(options, "paths") : undefined;
  const [first]: unknown[] = Array.isArray(paths) ? paths : [];
  if (typeof first !== "object" || first === null) {
    throw new Error(`vite.config.ts: ${restrictedImport} names no restricted package.`);
  }
  return {
    name: String(Reflect.get(first, "name")),
    importNames: [...(Reflect.get(first, "importNames") as string[])],
  };
}

function exemptFiles(): string[] {
  return (config.lint?.overrides ?? [])
    .filter(({ rules }) => rules?.[restrictedImport] === "off")
    .flatMap(({ files }) => [files].flat())
    .map((file) => join(repositoryRoot, file));
}

const runners = restrictedRunners();
const exempt = exemptFiles();
const checkedFiles = [...scriptFiles, ...scriptFilesInDotDirectories];

function isInThePackage(declaration: ts.Node): boolean {
  return isFileOfPackage(fileOf(declaration), [runners.name]);
}

function isARunner(declaration: ts.Node): boolean {
  return isInThePackage(declaration) && runners.importNames.includes(nameOf(declaration));
}

function namesARunner(program: Program, node: ts.Node): boolean {
  if (ts.isImportSpecifier(node) || ts.isExportSpecifier(node)) {
    return declarationsOf(program, node.name).some(isARunner);
  }
  return (
    (ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node) ||
      ts.isBindingElement(node)) &&
    memberDeclarations(program, node).some(isARunner)
  );
}

function namesThePackage(program: Program, call: ts.CallExpression): boolean {
  const loaded = moduleSpecifierOf(call);
  return call.arguments.some(
    (argument) =>
      (ts.isStringLiteralLikeNode(argument) && argument.text === runners.name) ||
      (argument === loaded &&
        (stringsIn(program, argument).includes(runners.name) ||
          declarationsOf(program, argument).some(isInThePackage))),
  );
}

function holdsARunner(program: Program, node: ts.Node): boolean {
  return propertyDeclarations(program, node, runners.importNames).some(isARunner);
}

function memberReadOn(program: Program, node: ts.Node): ts.Node | undefined {
  const { parent } = node;
  if (ts.isParenthesizedExpression(parent) || ts.isNonNullExpression(parent)) {
    return memberReadOn(program, parent);
  }
  if (ts.isPropertyAccessExpression(parent) && parent.expression === node) return parent;
  return ts.isElementAccessExpression(parent) &&
    parent.expression === node &&
    stringsIn(program, parent.argumentExpression).length > 0
    ? parent
    : undefined;
}

function whereItIsUsedWhole(program: Program, holder: ts.Node): ts.Node | undefined {
  const read = memberReadOn(program, holder);
  if (!read) return holder;
  return holdsARunner(program, read) ? whereItIsUsedWhole(program, read) : undefined;
}

function importedNames(nodes: readonly ts.Node[]): ts.Identifier[] {
  return nodes.flatMap((node) => {
    if (ts.isImportClause(node)) return node.name ? [node.name] : [];
    return ts.isNamespaceImport(node) || ts.isImportSpecifier(node) ? [node.name] : [];
  });
}

function usedWhole(program: Program, nodes: readonly ts.Node[]): ts.Node[] {
  const holders = new Set(
    importedNames(nodes)
      .filter((name) => holdsARunner(program, name))
      .map(({ text }) => text),
  );
  return nodes
    .filter(
      (node) => isValueReference(node) && holders.has(node.text) && holdsARunner(program, node),
    )
    .flatMap((holder) => whereItIsUsedWhole(program, holder) ?? []);
}

function waysRoundTheRunner(program: Program, file: string): string[] {
  const source = program.sourceFile(file);
  if (!source) throw new Error(`${file}: TypeScript opened no source for this file.`);
  const nodes = descendants(source);
  const found = (node: ts.Node, why: string) =>
    `${located(node)}: ${firstLine(node)}: ${why} Instead, ${useTheRunner}`;
  return [
    ...nodes
      .filter((node) => namesARunner(program, node))
      .map((node) => found(node, `this names one of ${runners.name}'s runners.`)),
    ...nodes
      .filter((node) => ts.isCallExpression(node))
      .filter((call) => namesThePackage(program, call))
      .map((call) =>
        found(
          call,
          `this call is given ${runners.name}'s name, or loads a file of it, so what it gets cannot be followed.`,
        ),
      ),
    ...usedWhole(program, nodes).map((node) =>
      found(
        node,
        `this uses what holds ${runners.name}'s runners as a whole, or by a name the type checker does not know, so a runner can be reached through it unseen.`,
      ),
    ),
  ];
}

const packageEntry = fileURLToPath(import.meta.resolve(runners.name));
const reExportingModule = virtualFile(`export * from "${runners.name}";\n`, ".ts");
const refusedSpellings: Record<string, string> = {
  "an import under another name": `import { assert as run } from "${runners.name}";\nexport const kept = run;`,
  "a namespace import": `import * as whole from "${runners.name}";\nexport const kept = whole.assert;`,
  "a default import under another name": `import other from "${runners.name}";\nexport const kept = other.check;`,
  "a re-export under another name": `export { sample as drawn } from "${runners.name}";`,
  "an import from a module that re-exports the package": `import { statistics } from "./${basename(reExportingModule)}";\nexport const kept = statistics;`,
  "a dynamic import": `export const later = await import("${runners.name}");`,
  "a dynamic import of a constant": `const name = "${runners.name}";\nexport const later: unknown = await import(name);`,
  "a dynamic import of a file of the package": `export const later: unknown = await import(${JSON.stringify(packageEntry)});`,
  "a require": `import { createRequire } from "node:module";\nexport const required: unknown = createRequire(import.meta.url)("${runners.name}");`,
  "a runner called through call": `import other from "${runners.name}";\nexport const called = other.assert.call(undefined, other.property(other.nat(), () => true));`,
  "a runner passed on as a value": `import other from "${runners.name}";\nexport const passed = [other.property(other.nat(), () => true)].map(other.check);`,
  "an element access": `import other from "${runners.name}";\nexport const kept = other["configureGlobal"];`,
  "a destructuring": `import other from "${runners.name}";\nexport const { installGlobalPlugin: kept } = other;`,
  "the package under a new name": `import other from "${runners.name}";\nexport const renamed = other;`,
  "the package asserted to another type": `import other from "${runners.name}";\nexport const loose = other as unknown as Record<string, unknown>;`,
  "the package through a module that re-exports it": `import * as whole from "./${basename(reExportingModule)}";\nexport const loose = whole as unknown as Record<string, unknown>;`,
  "the default member of a namespace import, kept": `import * as whole from "${runners.name}";\nexport const renamed = whole.default;`,
  "an element access by any of its names": `import other from "${runners.name}";\nexport const kept = (name: keyof typeof other) => other[name];`,
  "an element access by a name the type checker does not know": `import other from "${runners.name}";\nexport const kept = (name: string) => other[name as never];`,
  "the package handed to a function": `import other from "${runners.name}";\nexport const kept = (name: string) => Reflect.get(other, name);`,
};
const allowedSpellings: Record<string, string> = {
  "arbitraries, properties and commands by name": `import fc from "${runners.name}";\nexport const property = fc.property(fc.nat(), () => true);\nexport const commands = fc.commands([]);\nexport const ran = fc["modelRun"];`,
  "a type": `import type fc from "${runners.name}";\nexport type Numbers = fc.Arbitrary<number>;\nexport type Whole = typeof import("${runners.name}");`,
  "the property runner": `import { assertProperty } from "#/tests/support/properties.ts";\nexport const run = assertProperty;`,
  "a module name built at run time, which the rule cannot follow": `export const later: unknown = await import(${JSON.stringify(runners.name.split("-"))}.join("-"));`,
};
const spelt = (spellings: Record<string, string>): [string, string][] =>
  Object.entries(spellings).map(([spelling, text]) => [spelling, virtualFile(text, ".ts")]);
const refused = spelt(refusedSpellings);
const allowed = spelt(allowedSpellings);
const spelledWith = (
  spellings: Record<string, [text: string, extension: string]>,
): [string, string][] =>
  Object.entries(spellings).map(([spelling, [text, extension]]) => [
    spelling,
    virtualFile(text, extension),
  ]);
const refusedCaptures = spelledWith(refusedCaptureSpellings);
const allowedCaptures = spelledWith(allowedCaptureSpellings);

const program = openProgram(checkedFiles.map((file) => join(repositoryRoot, file)));
const spellings = openProgram(
  [...refused, ...allowed, ...refusedCaptures, ...allowedCaptures].map(([, file]) => file),
);
afterAll(() => {
  program.dispose();
  spellings.dispose();
});

test("the lint rule that refuses fast-check's runners exempts exactly one module, and that module names a runner", () => {
  expect(exempt).toHaveLength(1);
  expect(waysRoundTheRunner(program, exempt[0])).not.toEqual([]);
});

test("outside the property runner, no script file names one of fast-check's runners, gives the package's name to a call, or uses what holds its runners as a whole", () => {
  expect(
    checkedFiles
      .map((file) => join(repositoryRoot, file))
      .filter((file) => !exempt.includes(file))
      .flatMap((file) => waysRoundTheRunner(program, file)),
  ).toEqual([]);
});

test("every file git tracks whose name ends as a script's does, .mts and .jsx included, is one that rule reads, in a dot directory or not", () => {
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: repositoryRoot, encoding: "utf8" })
    .split("\0")
    .filter((file) => anyScriptFile.test(file));

  expect(tracked.length).toBeGreaterThan(10);
  expect(tracked.filter((file) => !checkedFiles.includes(file))).toEqual([]);
});

test.for(refused)("the rule refuses %s", ([, file]) => {
  expect(waysRoundTheRunner(spellings, file)).not.toEqual([]);
});

test.for(allowed)("the rule passes %s", ([, file]) => {
  expect(waysRoundTheRunner(spellings, file)).toEqual([]);
});

test(`no script file captures an image or a recording through Playwright: it reaches none of ${captures.join(", ")} as a member the type checker resolves, as an option it gives, or by name on a value typed any`, () => {
  expect(checkedFiles.flatMap((file) => capturesIn(program, join(repositoryRoot, file)))).toEqual(
    [],
  );
});

test.for(refusedCaptures)("the capture rule refuses %s", ([, file]) => {
  expect(capturesIn(spellings, file)).not.toEqual([]);
});

test.for(allowedCaptures)("the capture rule passes %s", ([, file]) => {
  expect(capturesIn(spellings, file)).toEqual([]);
});

definePropertyRunnerTests();
