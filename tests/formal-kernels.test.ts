import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { expect, test } from "vite-plus/test";
import { kernelModules } from "#/scripts/formal-verification.ts";
import { compileModel, runModel } from "#/scripts/formal/run.ts";
import { fileNamedBy } from "#/scripts/subpath.ts";
import { exportsOf, moduleSpecifierOf, parse, ts } from "#/scripts/syntax.ts";
import { repositoryRoot, trackedFiles } from "#/tests/support/workspace.ts";

const domKernel = "tests/fixtures/formal-kernels/names-the-dom.ts";
const uncalledKernel = "tests/fixtures/formal-kernels/never-called.ts";
const constKernel = "tests/fixtures/formal-kernels/exports-a-const.ts";
const takesTheBarrel = "tests/fixtures/formal-kernels/takes-the-barrel.ts";
const takesARelativeSource = "tests/fixtures/formal-kernels/takes-a-relative-source.ts";
const tsModel = /\.model\.ts$/;
const librarySourceFile = /^packages\/[\w-]+\/src\/.+\.tsx?$/;

type Manifest = { name?: string; exports?: Record<string, { types?: string } | string> };

function read(file: string): string {
  return readFileSync(join(repositoryRoot, file), "utf8");
}

const workspaceEntries = new Map(
  trackedFiles()
    .filter((file) => /^packages\/[\w-]+\/package\.json$/.test(file))
    .flatMap((file) => {
      const manifest: Manifest = JSON.parse(read(file));
      const entry = manifest.exports?.["."];
      const types = typeof entry === "object" ? entry.types : entry;
      return manifest.name === undefined || types === undefined
        ? []
        : [[manifest.name, join(dirname(file), types)] as const];
    }),
);

function importsOfFile(file: string): string[] {
  return parse(join(repositoryRoot, file)).statements.flatMap((statement) => {
    const typeOnly =
      (ts.isImportDeclaration(statement) &&
        statement.importClause?.phaseModifier === ts.SyntaxKind.TypeKeyword) ||
      (ts.isExportDeclaration(statement) && statement.isTypeOnly);
    const specifier = moduleSpecifierOf(statement);
    if (typeOnly || specifier === undefined || !ts.isStringLiteral(specifier)) return [];
    const entry = workspaceEntries.get(specifier.text);
    if (entry !== undefined) return [entry];
    const reached = fileNamedBy(join(repositoryRoot, file), specifier.text);
    return reached === undefined || !existsSync(reached) ? [] : [relative(repositoryRoot, reached)];
  });
}

function exportedValuesOf(file: string): string[] {
  const { functions, others } = exportsOf(parse(join(repositoryRoot, file)));
  return [...functions, ...others.filter((name) => /^\w+$/.test(name))];
}

function typeProblemsOf(kernel: string): string[] {
  const probe = `import * as kernel from "#/${kernel}";\n\nlet probed = true;\n\nexport const probe = () => {\n  probed = !probed;\n};\n`;
  try {
    compileModel("kernel-probe.ts", probe);
    return [];
  } catch (error) {
    return [
      `${kernel} does not type-check under tla-ts, which sees no DOM and checks strictly. Keep the DOM in the module that calls it: ${String(error)}`,
    ];
  }
}

function uncalledExportsOf(kernel: string, specs: readonly string[]): string[] {
  return exportedValuesOf(kernel)
    .filter(
      (name) => !specs.some((spec) => new RegExp(`^${name}(?:_\\d+)?(?:\\(| ==)`, "m").test(spec)),
    )
    .map(
      (name) =>
        `${kernel} exports ${name}, which no model that tla-ts passes compiles. Call it from a model, so tla-ts reads it in its subset.`,
    );
}

function librarySourcesTakenBy(model: string): string[] {
  return importsOfFile(model)
    .filter(
      (file) => librarySourceFile.test(file) && !kernelModules.some((kernel) => kernel === file),
    )
    .map((file) => `${model} imports ${file}, which kernelModules does not list.`);
}

const models = trackedFiles().filter((file) => tsModel.test(file));
const sources = trackedFiles().filter((file) => librarySourceFile.test(file));

test("every kernel module type-checks under tla-ts, and a module that names a DOM type does not", () => {
  expect(kernelModules.flatMap(typeProblemsOf)).toEqual([]);
  expect(typeProblemsOf(domKernel).join("\n")).toContain("Cannot find name 'HTMLElement'");
});

test("every value a kernel module exports is compiled into a model that tla-ts passes, and an export no model calls fails, a constant among them", async () => {
  const runs = await Promise.all(models.map((model) => runModel(model)));
  const failed = runs
    .filter(({ result }) => result.status !== "success")
    .map(({ model, result }) => `${model}: ${result.status}`);
  const specs = runs.map(({ spec }) => spec);

  expect(failed).toEqual([]);
  expect(kernelModules.flatMap((kernel) => uncalledExportsOf(kernel, specs))).toEqual([]);
  expect(uncalledExportsOf(uncalledKernel, specs)).toEqual([
    `${uncalledKernel} exports nextIndex, which no model that tla-ts passes compiles. Call it from a model, so tla-ts reads it in its subset.`,
  ]);
  expect(uncalledExportsOf(constKernel, specs)).toEqual([
    `${constKernel} exports nextOf, which no model that tla-ts passes compiles. Call it from a model, so tla-ts reads it in its subset.`,
  ]);
});

test("a model takes from a library's sources only kernel modules, by a subpath, a relative path or the package's name, and every kernel module is called by a source of its library", () => {
  const libraryOf = (file: string) => file.split("/").slice(0, 2).join("/");
  const callers = (kernel: string) =>
    sources.filter(
      (source) =>
        source !== kernel &&
        libraryOf(source) === libraryOf(kernel) &&
        importsOfFile(source).includes(kernel),
    );

  expect(models.flatMap(librarySourcesTakenBy)).toEqual([]);
  expect(librarySourcesTakenBy(takesTheBarrel)).toEqual([
    `${takesTheBarrel} imports packages/core/src/index.ts, which kernelModules does not list.`,
  ]);
  expect(librarySourcesTakenBy(takesARelativeSource)).toEqual([
    `${takesARelativeSource} imports packages/core/src/stable-class.ts, which kernelModules does not list.`,
  ]);
  expect(
    kernelModules
      .filter((kernel) => callers(kernel).length === 0)
      .map((kernel) => `${kernel}: no source of its library calls it.`),
  ).toEqual([]);
});

test("git ignores the spec and config tla-ts writes beside each model, named for the module in its MODULE header, and a trace's spec, and no hand-written spec", () => {
  const ignored = (path: string) =>
    spawnSync("git", ["check-ignore", "--quiet", path], { cwd: repositoryRoot }).status === 0;
  const written = models.flatMap((model) => {
    const { module } = compileModel(model);
    return [".tla", ".cfg", "_TTrace_1.tla"].map(
      (ending) => `${dirname(model)}/${module}${ending}`,
    );
  });

  expect(written.length).toBeGreaterThan(0);
  expect(written.filter((path) => !ignored(path))).toEqual([]);
  expect(
    [
      "formal/tabs/Proofs.tla",
      "formal/tabs/HandWrittenModel.tla",
      "formal/tabs/HandWrittenModel.cfg",
    ].filter(ignored),
  ).toEqual([]);
});
