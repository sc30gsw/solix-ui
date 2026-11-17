import { join } from "node:path";
import fc from "fast-check";
import {
  mergeConfig,
  type TestProjectConfiguration,
  type TestProjectInlineConfiguration,
} from "vite-plus";
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
import { located } from "#/tests/support/primitive-rules/library.ts";
import { repositoryRoot, scriptFiles } from "#/tests/support/workspace.ts";
import config from "#/vite.config.ts";

const pluginInstaller = "installGlobalPlugin";
const runners = ["assert", "configureGlobal"];
const parametersThatReportOrInterrupt = [
  "reporter",
  "asyncReporter",
  "interruptAfterTimeLimit",
  "skipAllAfterTimeLimit",
  "plugins",
];
const shortTimeout = 1_000;
const runTime = 100;
const slowRuns = 100;

function isInline(
  definition: TestProjectConfiguration,
): definition is TestProjectInlineConfiguration {
  return (
    typeof definition === "object" &&
    !(definition instanceof Promise) &&
    typeof definition.extends !== "string"
  );
}

const { projects: definitions = [], ...shared } = config.test ?? {};
const projects = definitions.map((definition, index) => {
  if (!isInline(definition)) {
    throw new Error(`vite.config.ts: project ${index} is not an inline project this check reads.`);
  }
  const resolved: TestProjectInlineConfiguration =
    definition.extends === false ? definition : mergeConfig({ test: shared }, definition);
  return {
    name: JSON.stringify(resolved.test?.name ?? index),
    setupFiles: [resolved.test?.setupFiles ?? []].flat().map((file) => join(repositoryRoot, file)),
  };
});

const checkedFiles = scriptFiles.map((file) => join(repositoryRoot, file));
const program = openProgram(checkedFiles);
afterAll(program.dispose);

function callsIn(file: string): ts.CallExpression[] {
  const source = program.sourceFile(file);
  if (!source) throw new Error(`${file}: TypeScript opened no source for this file.`);
  return descendants(source).filter((node) => ts.isCallExpression(node));
}

function declarationOf(call: ts.CallExpression): ts.Node | undefined {
  const declaration = calledDeclaration(program, call);
  return declaration && isPackageFile(fileOf(declaration)) ? declaration : undefined;
}

const installers = checkedFiles.flatMap((file) =>
  callsIn(file).flatMap((call) => {
    const declaration = declarationOf(call);
    return declaration && nameOf(declaration) === pluginInstaller
      ? [{ file, library: fileOf(declaration) }]
      : [];
  }),
);
const configured = new Set(installers.map(({ library }) => library));

function isRunner(declaration: ts.Node): boolean {
  return runners.includes(nameOf(declaration)) && configured.has(fileOf(declaration));
}

function parametersOf(call: ts.CallExpression, declaration: ts.Node): ts.Expression | undefined {
  if (!ts.isFunctionDeclaration(declaration)) return undefined;
  const index = declaration.parameters.length - 1;
  return call.arguments[index];
}

function escapes(call: ts.CallExpression): string[] {
  const declaration = declarationOf(call);
  if (!declaration || !isRunner(declaration)) return [];
  if (call.arguments.some((argument) => ts.isSpreadElement(argument))) {
    return ["pass the property and its parameters as arguments of their own, not spread"];
  }
  const parameters = parametersOf(call, declaration);
  if (!parameters) return [];
  const type = program.checker.getTypeAtLocation(parameters);
  return parametersThatReportOrInterrupt
    .filter((name) => type && program.checker.getPropertyOfType(type, name))
    .map(
      (name) =>
        `${name} reports or interrupts a run by itself, which the time limit in the setup file cannot see`,
    );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("every test project loads the setup file that installs the time limit on generated tests", () => {
  expect(installers.map(({ file }) => file)).not.toEqual([]);
  expect(
    projects.flatMap(({ name, setupFiles: loaded }) =>
      installers
        .filter(({ file }) => !loaded.includes(file))
        .map(
          ({ file }) =>
            `${name}: load ${file} in setupFiles, so its generated tests report in time`,
        ),
    ),
  ).toEqual([]);
});

test("every fast-check run or global setting that a test reaches goes through the time limit the setup file installs", () => {
  const runs = checkedFiles.flatMap(callsIn).filter((call) => {
    const declaration = declarationOf(call);
    return declaration !== undefined && isRunner(declaration);
  });
  expect(runs).not.toEqual([]);
  expect(
    checkedFiles.flatMap((file) =>
      callsIn(file).flatMap((call) =>
        escapes(call).map((reason) => `${located(call)}: ${firstLine(call)}: ${reason}.`),
      ),
    ),
  ).toEqual([]);
});

test(
  "a property that fails and is still shrinking when its time runs out reports its seed, its path and its counterexample before the test's timeout",
  { timeout: shortTimeout },
  async () => {
    await expect(
      fc.assert(
        fc.asyncProperty(fc.maxSafeNat(), async (value) => {
          await delay(runTime);
          expect(value).toBe(0);
        }),
        { examples: [[Number.MAX_SAFE_INTEGER]] },
      ),
    ).rejects.toThrow(
      /^Property failed after 1 tests\n\{ seed: -?\d+, path: "0(?::\d+)*", endOnFailure: true \}\nCounterexample: \[\d+\]\nShrunk \d+ time\(s\)/,
    );
  },
);

test(
  "a property that passes but runs out of time fails, with its seed, before the test's timeout",
  { timeout: shortTimeout },
  async () => {
    await expect(
      fc.assert(
        fc.asyncProperty(fc.nat(), async () => {
          await delay(runTime);
        }),
        { numRuns: slowRuns },
      ),
    ).rejects.toThrow(/^Property interrupted after \d+ tests\n\{ seed: -?\d+ \}/);
  },
);
