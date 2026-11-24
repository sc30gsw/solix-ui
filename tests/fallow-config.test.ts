import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isAbsolute, join, matchesGlob, relative } from "node:path";
import { expect, test } from "vite-plus/test";
import { copyScript } from "#/scripts/agent-kit.ts";
import { pnpmSettings } from "#/scripts/pnpm-settings.ts";
import { exportsOf, parse } from "#/scripts/syntax.ts";
import { packagesBuiltFirst } from "#/tests/support/project-setups.ts";
import { repositoryRoot, trackedFiles } from "#/tests/support/workspace.ts";
import config from "#/vite.config.ts";

type FallowConfig = {
  entry?: string[];
  supportEntry?: string[];
  ignoreExports?: { file: string; exports: string[] }[];
  ignoreDependencyOverrides?: { package: string }[];
};

const configFile = ".fallowrc.json";
const fallow = join(repositoryRoot, "node_modules/.bin/fallow");
const hookFiles = [
  ".vite-hooks/pre-commit",
  ".vite-hooks/pre-merge-commit",
  ".vite-hooks/commit-msg",
];
const removedByPnpm = "-";
const defaultExportRule = "import/no-default-export";
const scriptRunByNode = /\bnode\s+(\S+\.[cm]?[jt]s)\b/g;

const fallowConfig: FallowConfig = JSON.parse(
  readFileSync(join(repositoryRoot, configFile), "utf8"),
);

function fromTheRoot(file: string): string {
  return isAbsolute(file) ? relative(repositoryRoot, file) : file;
}

function stringsAt(value: unknown): string[] {
  return [value].flat().filter((each): each is string => typeof each === "string");
}

function namedByTheProjects(): string[] {
  return (config.test?.projects ?? []).flatMap((project) => {
    const settings: unknown =
      typeof project === "object" && project !== null ? Reflect.get(project, "test") : undefined;
    if (typeof settings !== "object" || settings === null) return [];
    return [
      ...stringsAt(Reflect.get(settings, "globalSetup")),
      ...stringsAt(Reflect.get(settings, "setupFiles")),
    ].map(fromTheRoot);
  });
}

function runByTheHooks(): string[] {
  return hookFiles.flatMap((hook) =>
    [...readFileSync(join(repositoryRoot, hook), "utf8").matchAll(scriptRunByNode)].map(
      ([, script]) => script,
    ),
  );
}

function defaultExportFiles(): string[] {
  const exempt = (config.lint?.overrides ?? []).find(
    ({ rules }) => rules?.[defaultExportRule] === "off",
  );
  return exempt?.files ?? [];
}

function unusedFiles(): string[] {
  const run = spawnSync(fallow, ["dead-code", "--format", "json", "--quiet"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, FALLOW_TELEMETRY_DISABLED: "1" },
    maxBuffer: 64 * 1024 * 1024,
  });
  const report: { unused_files: { path: string }[] } = JSON.parse(run.stdout);
  return report.unused_files.map(({ path }) => path);
}

test(`every file ${configFile} lists in entry, supportEntry and ignoreExports is tracked, and every name an ignoreExports entry gives is an export of its file`, () => {
  const tracked = new Set(trackedFiles());
  const listed = [
    ...(fallowConfig.entry ?? []),
    ...(fallowConfig.supportEntry ?? []),
    ...(fallowConfig.ignoreExports ?? []).map(({ file }) => file),
  ];
  const exportProblems = (fallowConfig.ignoreExports ?? []).flatMap(({ file, exports }) => {
    if (!tracked.has(file)) return [];
    const { functions, types, others } = exportsOf(parse(join(repositoryRoot, file)));
    const exported = [...functions, ...types, ...others];
    return exports
      .filter((name) => !exported.includes(name))
      .map((name) => `${configFile}: ignoreExports names ${name}, which ${file} does not export.`);
  });

  expect(listed.length).toBeGreaterThan(0);
  expect(listed.filter((file) => !tracked.has(file))).toEqual([]);
  expect(exportProblems).toEqual([]);
});

test(`${configFile} ignores exactly the overrides that pnpm-workspace.yaml sets to "${removedByPnpm}", which keep a package out of every install and so match none installed`, () => {
  const { overrides } = pnpmSettings();
  const removed = Object.keys(overrides).filter((name) => overrides[name] === removedByPnpm);
  const ignored = (fallowConfig.ignoreDependencyOverrides ?? []).map(({ package: name }) => name);

  expect(removed.length).toBeGreaterThan(0);
  expect(ignored.toSorted()).toEqual(removed.toSorted());
});

test(`supportEntry in ${configFile} holds every file that a test project's globalSetup or setupFiles, the agent kit's copy script or a git hook names only as a string`, () => {
  const named = new Set([
    ...packagesBuiltFirst,
    ...namedByTheProjects(),
    copyScript,
    ...runByTheHooks(),
  ]);
  const support = fallowConfig.supportEntry ?? [];

  expect(named.size).toBeGreaterThan(packagesBuiltFirst.length);
  expect([...named].filter((file) => !support.includes(file))).toEqual([]);
});

test(`fallow reports no tracked file that the ${defaultExportRule} override in vite.config.ts lists as unused, so each file a tool loads by convention is an entry point or imported`, () => {
  const patterns = defaultExportFiles();
  const loaded = trackedFiles().filter((file) =>
    patterns.some((pattern) => matchesGlob(file, pattern)),
  );
  const unused = new Set(unusedFiles());

  expect(patterns.length).toBeGreaterThan(0);
  expect(loaded.length).toBeGreaterThan(0);
  expect(loaded.filter((file) => unused.has(file))).toEqual([]);
});
