import { join } from "node:path";
import { afterAll, expect, test } from "vite-plus/test";
import {
  calledDeclaration,
  descendants,
  fileOf,
  firstLine,
  isPackageFile,
  nameOf,
  openProgram,
  ts,
} from "#/scripts/syntax.ts";
import { definePropertyRunnerTests } from "#/tests/support/property-runner-cases.ts";
import { located } from "#/tests/support/primitive-rules/library.ts";
import { repositoryRoot, scriptFiles } from "#/tests/support/workspace.ts";
import config from "#/vite.config.ts";

type RestrictedImport = { name: string; importNames: string[] };

const restrictedImport = "no-restricted-imports";

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
const checkedFiles = scriptFiles.map((file) => join(repositoryRoot, file));
const program = openProgram(checkedFiles);
afterAll(program.dispose);

function callsIn(file: string): ts.CallExpression[] {
  const source = program.sourceFile(file);
  if (!source) throw new Error(`${file}: TypeScript opened no source for this file.`);
  return descendants(source).filter((node) => ts.isCallExpression(node));
}

function runnerCalled(call: ts.CallExpression): ts.Node | undefined {
  const declaration = calledDeclaration(program, call);
  if (!declaration || !isPackageFile(fileOf(declaration))) return undefined;
  const inThePackage = fileOf(declaration).split(/[\\/]/).includes(runners.name);
  return inThePackage && runners.importNames.includes(nameOf(declaration))
    ? declaration
    : undefined;
}

test("the lint rule that refuses fast-check's runners exempts exactly one module, and that module runs properties", () => {
  expect(exempt).toHaveLength(1);
  expect(callsIn(exempt[0]).filter((call) => runnerCalled(call) !== undefined)).not.toEqual([]);
});

test("no call outside the property runner reaches one of fast-check's runners, by any name", () => {
  expect(
    checkedFiles
      .filter((file) => !exempt.includes(file))
      .flatMap((file) =>
        callsIn(file)
          .filter((call) => runnerCalled(call) !== undefined)
          .map(
            (call) =>
              `${located(call)}: ${firstLine(call)}: run the property with assertProperty from the property runner, which gives it its test's time limit.`,
          ),
      ),
  ).toEqual([]);
});

definePropertyRunnerTests();
