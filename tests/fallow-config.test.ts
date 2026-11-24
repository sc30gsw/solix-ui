import { readFileSync } from "node:fs";
import { join, matchesGlob, relative, resolve } from "node:path";
import { expect, test } from "vite-plus/test";
import { copyScript } from "#/scripts/agent-kit.ts";
import { unusedFilesIn } from "#/scripts/fallow-audit.ts";
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

type SetupConfig = {
  readonly root?: string;
  readonly test?: {
    readonly globalSetup?: string | readonly string[];
    readonly setupFiles?: string | readonly string[];
  };
};

const configFile = ".fallowrc.json";
const hooksDirectory = ".vite-hooks/";
const removedByPnpm = "-";
const defaultExportRule = "import/no-default-export";
const scriptRunByNode = /\bnode(?:\s+-\S+)*\s+["']?([^"'\s]+\.[cm]?[jt]s)["']?/g;

const fallowConfig: FallowConfig = JSON.parse(
  readFileSync(join(repositoryRoot, configFile), "utf8"),
);

function fromTheRoot(file: string, base: string): string {
  return relative(repositoryRoot, resolve(base, file));
}

function stringsOf(value: string | readonly string[] | undefined): readonly string[] {
  if (value === undefined) return [];
  return typeof value === "string" ? [value] : value;
}

function setupsIn(entry: SetupConfig, parentRoot: string): string[] {
  const base = entry.root === undefined ? parentRoot : resolve(parentRoot, entry.root);
  return [...stringsOf(entry.test?.globalSetup), ...stringsOf(entry.test?.setupFiles)].map((file) =>
    fromTheRoot(file, base),
  );
}

function isSetupConfig(value: unknown): value is SetupConfig {
  return typeof value === "object" && value !== null;
}

function namedByTheProjects(): string[] {
  const rootBase =
    config.root === undefined ? repositoryRoot : resolve(repositoryRoot, config.root);
  const fromRoot = setupsIn(config, repositoryRoot);
  const fromProjects = (config.test?.projects ?? []).flatMap((project) =>
    isSetupConfig(project) ? setupsIn(project, rootBase) : [],
  );
  return [...fromRoot, ...fromProjects];
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
  const unused = new Set(unusedFilesIn(repositoryRoot));

  expect(patterns.length).toBeGreaterThan(0);
  expect(loaded.length).toBeGreaterThan(0);
  expect(loaded.filter((file) => unused.has(file))).toEqual([]);
});
