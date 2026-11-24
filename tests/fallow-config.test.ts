import { readFileSync } from "node:fs";
import { isAbsolute, join, matchesGlob, relative } from "node:path";
import { expect, test } from "vite-plus/test";
import { copyScript } from "#/scripts/agent-kit.ts";
import { fallowJson } from "#/scripts/fallow-audit.ts";
import { pnpmSettings } from "#/scripts/pnpm-settings.ts";
import { exportsOf, parse } from "#/scripts/syntax.ts";
import { repositoryRoot, trackedFiles } from "#/tests/support/workspace.ts";
import config from "#/vite.config.ts";

type FallowConfig = {
  entry?: string[];
  supportEntry?: string[];
  ignoreFindings?: string[];
  ignoreExports?: { file: string; exports: string[] }[];
  ignoreDependencyOverrides?: { package: string }[];
};

const configFile = ".fallowrc.json";
const hooksDirectory = ".vite-hooks/";
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

function runByTheHooks(hooks: readonly string[]): string[] {
  return hooks.flatMap((hook) =>
    [...readFileSync(join(repositoryRoot, hook), "utf8").matchAll(scriptRunByNode)].map(
      ([, script]) => script,
    ),
  );
}

function defaultExportFiles(): string[] {
  return (config.lint?.overrides ?? []).flatMap(({ files, rules }) =>
    rules?.[defaultExportRule] === "off" ? files : [],
  );
}

function unusedFiles(): string[] {
  const report = fallowJson(["dead-code"], repositoryRoot);
  const items: unknown =
    typeof report === "object" && report !== null ? Reflect.get(report, "unused_files") : undefined;
  if (!Array.isArray(items)) {
    throw new Error("fallow dead-code --format json returned no unused_files array.");
  }
  return items.map((entry: unknown) => {
    const path: unknown =
      typeof entry === "object" && entry !== null ? Reflect.get(entry, "path") : undefined;
    if (typeof path !== "string") {
      throw new Error(
        "fallow dead-code --format json returned an unused_files entry without path.",
      );
    }
    return path;
  });
}

test(`every file ${configFile} lists in entry, supportEntry and ignoreExports is tracked, every ignoreExports name is exported by its file, and every ignoreFindings pattern matches a tracked file`, () => {
  const allTracked = trackedFiles();
  const tracked = new Set(allTracked);
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
  const findingPatterns = fallowConfig.ignoreFindings ?? [];
  const unmatchedFindings = findingPatterns.filter(
    (pattern) => !allTracked.some((file) => matchesGlob(file, pattern)),
  );

  expect(listed.length).toBeGreaterThan(0);
  expect(listed.filter((file) => !tracked.has(file))).toEqual([]);
  expect(exportProblems).toEqual([]);
  expect(unmatchedFindings).toEqual([]);
});

test(`${configFile} ignores exactly the overrides that pnpm-workspace.yaml sets to "${removedByPnpm}", which keep a package out of every install and so match none installed`, () => {
  const { overrides } = pnpmSettings();
  const removed = Object.keys(overrides).filter((name) => overrides[name] === removedByPnpm);
  const ignored = (fallowConfig.ignoreDependencyOverrides ?? []).map(({ package: name }) => name);

  expect(removed.length).toBeGreaterThan(0);
  expect(ignored.toSorted()).toEqual(removed.toSorted());
});

test(`supportEntry in ${configFile} holds every file that a test project's globalSetup or setupFiles, the agent kit's copy script or a tracked ${hooksDirectory}* hook running node names`, () => {
  const hooks = trackedFiles().filter((file) => file.startsWith(hooksDirectory));
  const named = new Set([...namedByTheProjects(), copyScript, ...runByTheHooks(hooks)]);
  const support = fallowConfig.supportEntry ?? [];

  expect(hooks.length).toBeGreaterThan(0);
  expect(named.size).toBeGreaterThan(0);
  expect([...named].filter((file) => !support.includes(file))).toEqual([]);
});

test(`fallow reports no tracked file that an ${defaultExportRule} override in vite.config.ts lists as unused, so each file a tool loads by convention is an entry point or imported`, () => {
  const patterns = defaultExportFiles();
  const loaded = trackedFiles().filter((file) =>
    patterns.some((pattern) => matchesGlob(file, pattern)),
  );
  const unused = new Set(unusedFiles());

  expect(patterns.length).toBeGreaterThan(0);
  expect(loaded.length).toBeGreaterThan(0);
  expect(loaded.filter((file) => unused.has(file))).toEqual([]);
});
