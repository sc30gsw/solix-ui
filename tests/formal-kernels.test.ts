import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { kernelModules } from "#/scripts/formal-verification.ts";
import { runModel, runSource } from "#/tests/support/formal-graph.ts";
import { repositoryRoot, trackedFiles } from "#/tests/support/workspace.ts";

const domKernel = "tests/fixtures/formal-kernels/names-the-dom.ts";
const uncalledKernel = "tests/fixtures/formal-kernels/never-called.ts";
const exportedFunction = /^export function (\w+)/gm;
const librarySource = /from "#\/(packages\/[\w-]+\/src\/[\w./-]+)"/g;
const typeOnlyImport = /^import type /;
const tsModel = /\.model\.ts$/;
const librarySourceFile = /^packages\/[\w-]+\/src\/.+\.tsx?$/;

function read(file: string): string {
  return readFileSync(join(repositoryRoot, file), "utf8");
}

function probeOf(kernel: string): string {
  return `import * as kernel from "#/${kernel}";\n\nlet probed = true;\n\nexport const probe = () => {\n  probed = !probed;\n};\n`;
}

function typeProblemsOf(kernel: string): string[] {
  const run = runSource("kernel-probe.ts", probeOf(kernel));
  return run.status === 0
    ? []
    : [
        `${kernel} does not type-check under tla-ts, which sees no DOM and checks strictly. Keep the DOM in the module that calls it:\n${run.output}`,
      ];
}

function uncalledExportsOf(kernel: string, specs: readonly string[]): string[] {
  return [...read(kernel).matchAll(exportedFunction)]
    .map(([, name]) => name)
    .filter(
      (name) => !specs.some((spec) => new RegExp(`^${name}(?:_\\d+)?(?:\\(| ==)`, "m").test(spec)),
    )
    .map(
      (name) =>
        `${kernel} exports ${name}, which no model that tla-ts passes compiles. Call it from a model, so tla-ts reads it in its subset.`,
    );
}

const models = trackedFiles().filter((file) => tsModel.test(file));
const sources = trackedFiles().filter((file) => librarySourceFile.test(file));

test("every kernel module type-checks under tla-ts, and a module that names a DOM type does not", () => {
  expect(kernelModules.flatMap(typeProblemsOf)).toEqual([]);
  expect(typeProblemsOf(domKernel).join("\n")).toContain("Cannot find name 'HTMLElement'");
});

test("every function a kernel module exports is compiled into a model that tla-ts passes, and an export no model calls fails", () => {
  const runs = models.map((model) => runModel(model));
  const failed = runs
    .filter(({ status }) => status !== 0)
    .map(({ model, output }) => `${model}:\n${output}`);
  const specs = runs.map(({ spec }) => spec);

  expect(failed).toEqual([]);
  expect(kernelModules.flatMap((kernel) => uncalledExportsOf(kernel, specs))).toEqual([]);
  expect(uncalledExportsOf(uncalledKernel, specs)).toEqual([
    `${uncalledKernel} exports nextIndex, which no model that tla-ts passes compiles. Call it from a model, so tla-ts reads it in its subset.`,
  ]);
});

test("a model takes from a library's sources only kernel modules, and every kernel module is called by a source of its library", () => {
  const taken = models.flatMap((model) =>
    read(model)
      .split("\n")
      .filter((line) => !typeOnlyImport.test(line))
      .flatMap((line) => [...line.matchAll(librarySource)].map(([, file]) => ({ model, file }))),
  );
  const callers = (kernel: string) => {
    const [, library, file] = /^(packages\/[\w-]+)\/(src\/.+)$/.exec(kernel) ?? [];
    return sources.filter(
      (source) =>
        source !== kernel &&
        source.startsWith(`${library}/`) &&
        read(source).includes(`"#/${file}"`),
    );
  };

  expect(
    taken
      .filter(({ file }) => !kernelModules.some((kernel) => kernel === file))
      .map(({ model, file }) => `${model} imports ${file}, which kernelModules does not list.`),
  ).toEqual([]);
  expect(
    kernelModules
      .filter((kernel) => callers(kernel).length === 0)
      .map((kernel) => `${kernel}: no source of its library calls it.`),
  ).toEqual([]);
});

test("the files tla-ts writes beside a model, its spec, its config and a trace's spec, are ignored by git, and a hand-written spec is not", () => {
  const ignored = (path: string) =>
    spawnSync("git", ["check-ignore", "--quiet", path], { cwd: repositoryRoot }).status === 0;
  const written = models.flatMap((model) => {
    const directory = model.slice(0, model.lastIndexOf("/") + 1);
    const module = model
      .slice(directory.length)
      .replace(tsModel, "")
      .split("-")
      .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
      .join("");
    return [".tla", ".cfg", "_TTrace_1.tla"].map((ending) => `${directory}${module}Model${ending}`);
  });

  expect(written.length).toBeGreaterThan(0);
  expect(written.filter((path) => !ignored(path))).toEqual([]);
  expect(ignored("formal/tabs/Proofs.tla")).toBe(false);
});
