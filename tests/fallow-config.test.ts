import { readFileSync } from "node:fs";
import { join, matchesGlob, relative, resolve } from "node:path";
import { expect, test } from "vite-plus/test";
import { copyScript } from "#/scripts/agent-kit.ts";
import { unusedFilesIn } from "#/scripts/fallow-audit.ts";
import { pnpmSettings } from "#/scripts/pnpm-settings.ts";
import { exportsOf, parse } from "#/scripts/syntax.ts";
import { allProjectSettings } from "#/tests/support/run-settings.ts";
import { commandsOf } from "#/tests/support/skill-commands.ts";
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
const scriptExtension = /\.[cm]?[jt]sx?$/;
const envAssignment = /^[A-Za-z_]\w*=/;
const shellPrefixes = new Set(["exec", "!", "then", "else", "do"]);
const nodeInlineCodeFlags = ["-e", "--eval", "-p", "--print"] as const;
const nodePreloadFlags = ["--import", "--loader", "-r", "--require"] as const;
const nodeOtherValueFlags = new Set([
  "-C",
  "--conditions",
  "--env-file",
  "--env-file-if-exists",
  "--input-type",
]);
const shellCommentOrQuote = /"[^"]*"|'[^']*'|(^|[\s;|&])#.*$/g;

const fallowConfig: FallowConfig = JSON.parse(
  readFileSync(join(repositoryRoot, configFile), "utf8"),
);

function matchesFlag(token: string, flags: readonly string[]): string | undefined {
  return flags.find((flag) => token === flag || token.startsWith(`${flag}=`));
}

function parseNodeOption(words: readonly string[], at: number, scripts: string[]): number | "stop" {
  const token = words[at];
  if (token === "--") {
    scripts.push(...words.slice(at + 1, at + 2));
    return "stop";
  }
  if (matchesFlag(token, nodeInlineCodeFlags) !== undefined) return "stop";
  const preload = matchesFlag(token, nodePreloadFlags);
  if (preload !== undefined) {
    const equals = token.indexOf("=");
    const value = equals === -1 ? words[at + 1] : token.slice(equals + 1);
    if (value !== undefined) scripts.push(value);
    return equals === -1 ? at + 1 : at;
  }
  if (nodeOtherValueFlags.has(token)) return at + 1;
  if (!token.startsWith("-")) {
    scripts.push(token);
    return "stop";
  }
  return at;
}

function nodeScriptsIn(words: readonly string[]): string[] {
  const commandAt = words.findIndex(
    (word) => !envAssignment.test(word) && !shellPrefixes.has(word),
  );
  if (commandAt === -1 || words[commandAt] !== "node") return [];
  const scripts: string[] = [];
  for (let at = commandAt + 1; at < words.length; at += 1) {
    const next = parseNodeOption(words, at, scripts);
    if (next === "stop") break;
    at = next;
  }
  return scripts;
}

function scriptsRunByNodeIn(source: string): string[] {
  return source
    .replaceAll("\\\n", " ")
    .split("\n")
    .map((line) =>
      line
        .replace(shellCommentOrQuote, (match, before: string | undefined) =>
          before === undefined ? match : before,
        )
        .trim(),
    )
    .filter((line) => line !== "")
    .flatMap(commandsOf)
    .flatMap(nodeScriptsIn)
    .filter((script) => scriptExtension.test(script))
    .map((script) => relative(repositoryRoot, resolve(repositoryRoot, script)));
}

function runByTheHooks(hooks: readonly string[]): string[] {
  return hooks.flatMap((hook) =>
    scriptsRunByNodeIn(readFileSync(join(repositoryRoot, hook), "utf8")),
  );
}

function isRuleOff(rule: unknown): boolean {
  const severity = Array.isArray(rule) ? rule[0] : rule;
  return severity === "off" || severity === 0;
}

function defaultExportFiles(): string[] {
  return (config.lint?.overrides ?? []).flatMap(({ files, rules }) =>
    isRuleOff(rules?.[defaultExportRule]) ? files : [],
  );
}

test("scriptsRunByNodeIn finds scripts run with node across hook forms and ignores comments and inline evals", () => {
  const hook = [
    "# node scripts/commented.ts",
    "FOO=a#b node ./scripts/env-hash.ts # node scripts/inline-comment.ts",
    '[ $# -gt 0 ] && exec node --conditions node --import ./scripts/preload.mjs "scripts/main.ts"',
    "if true; then node --require=scripts/req.cjs -- scripts/after-dash.tsx; fi",
    'node -e "1" scripts/ignored-eval.ts && node --eval="1" scripts/ignored-eq.ts',
    "node \\",
    "  scripts/continued.mts",
  ].join("\n");

  expect(scriptsRunByNodeIn(hook)).toEqual([
    "scripts/env-hash.ts",
    "scripts/preload.mjs",
    "scripts/main.ts",
    "scripts/req.cjs",
    "scripts/after-dash.tsx",
    "scripts/continued.mts",
  ]);
});

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

test(`supportEntry in ${configFile} holds the agent kit's copy script, every file outside node_modules/ that a test project of vp run verify names in globalSetup or setupFiles, and every script scriptsRunByNodeIn finds in a tracked ${hooksDirectory}* hook`, () => {
  const settings = allProjectSettings(
    `whether supportEntry in ${configFile} holds every test project's globalSetup and setupFiles`,
  );
  const projectSetups = Object.values(settings)
    .flatMap(({ globalSetup, setupFiles }) => [...globalSetup, ...setupFiles])
    .filter((file) => !file.split("/").includes("node_modules"));
  const hooks = trackedFiles().filter((file) => file.startsWith(hooksDirectory));
  const named = new Set([...projectSetups, copyScript, ...runByTheHooks(hooks)]);
  const support = fallowConfig.supportEntry ?? [];

  expect(hooks.length).toBeGreaterThan(0);
  expect(named.size).toBeGreaterThan(0);
  expect([...named].filter((file) => !support.includes(file))).toEqual([]);
});

test(`fallow reports no tracked file that an override in vite.config.ts turning ${defaultExportRule} off lists as unused, so each file a tool loads by convention is an entry point or imported`, () => {
  const patterns = defaultExportFiles();
  const loaded = trackedFiles().filter((file) =>
    patterns.some((pattern) => matchesGlob(file, pattern)),
  );
  const unused = new Set(unusedFilesIn(repositoryRoot));

  expect(patterns.length).toBeGreaterThan(0);
  expect(loaded.length).toBeGreaterThan(0);
  expect(loaded.filter((file) => unused.has(file))).toEqual([]);
});
