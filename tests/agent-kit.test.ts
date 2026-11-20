import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  symlinkSync,
} from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import {
  type KitHookEvent,
  kitHookDidNotRun,
  kitHookEntries,
  kitInstalls,
  kitPackage,
  kitNotInstalled,
  kitVersion,
  claudeSkills,
  sharedSkills,
  readSettings,
  settingsFile,
  syncAgentKit,
  syncScript,
} from "#/scripts/agent-kit.ts";
import { refusals } from "#/scripts/agent-command-guard.ts";
import { approvedSkills } from "#/scripts/package-skills.ts";
import { workspaceFile } from "#/scripts/pnpm-settings.ts";
import { inTemporaryTree } from "#/tests/support/temporary-tree.ts";
import { repositoryRoot } from "#/tests/support/workspace.ts";

const blocking = 2;
const kitGuardrail = "solid2-agent-kit guardrail";
const subdirectory = "packages/core";
const kitSkill = `.claude/skills/${kitInstalls(repositoryRoot, "skills")[0]}`;
const manifest = "package.json";
const reactFixture = "tests/fixtures/agent-kit/react-hook.txt";
const lintScript = "lint:solid";
const solidCheatsheet = "node_modules/solid-js/CHEATSHEET.md";
const onlyInTheCheatsheet = [
  "resetErrorBoundaries",
  "getListener",
  "getObserver",
  "equalFn",
  "isEqual",
  "Suspense.Provider",
];
const readOnlyCommands = [
  "sed -n 1,40p .claude/settings.json",
  "cat .claude/settings.json 2>/dev/null",
  "grep -n solid .claude/skills/solid-2/SKILL.md 2>&1",
  "diff -r node_modules/solid2-agent-kit/files/skills/solid-2 .claude/skills/solid-2",
  "cp .claude/commands/solid2-review.md /tmp/review.md",
  "git diff main -- .claude/settings.json > /tmp/settings.diff",
  "git status",
];
const installed = "node_modules";
const replacedByTheKit = [
  { pack: "solid-js", name: "solid-2.0" },
  { pack: "solid-js", name: "solid-2.0-cheatsheet" },
];
const openPullRequest = ".agents/skills/open-pull-request/SKILL.md";
const reviewStep = /^(## 4\. [\s\S]*?)(?=^## )/m;

function commandFile(command: string): string {
  return `.claude/commands/${command}.md`;
}

type Run = { status: number | null; stderr: string };

function read(path: string): string {
  return readFileSync(join(repositoryRoot, path), "utf8");
}

function filesIn(root: string, directory = ""): string[] {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = directory === "" ? entry.name : `${directory}/${entry.name}`;
    return entry.isDirectory() ? filesIn(root, path) : [path];
  });
}

function contentOf(root: string, path: string): string {
  const file = join(root, path);
  const entry = lstatSync(file);
  if (entry.isSymbolicLink()) return `a link to ${readlinkSync(file)}`;
  return entry.isDirectory() ? "a directory" : readFileSync(file, "utf8");
}

function copyInto(root: string, path: string): void {
  const from = join(repositoryRoot, path);
  mkdirSync(dirname(join(root, path)), { recursive: true });
  if (lstatSync(from).isSymbolicLink()) symlinkSync(readlinkSync(from), join(root, path));
  else cpSync(from, join(root, path), { recursive: true });
}

function seedCheckout(root: string, paths: readonly string[]): void {
  symlinkSync(join(repositoryRoot, installed), join(root, installed));
  for (const path of [manifest, ...paths].filter((file) =>
    existsSync(join(repositoryRoot, file)),
  )) {
    copyInto(root, path);
  }
}

function nodesOnPath(): string[] {
  return [
    ...new Set(
      (process.env.PATH ?? "")
        .split(delimiter)
        .filter((directory) => directory !== "")
        .map((directory) => join(directory, "node"))
        .filter((file) => existsSync(file))
        .map((file) => realpathSync(file)),
    ),
  ];
}

function runKitHook(
  event: KitHookEvent,
  payload: Record<string, unknown>,
  {
    path,
    cwd = repositoryRoot,
    projectDirectory = repositoryRoot,
  }: {
    path: string;
    cwd?: string;
    projectDirectory?: string;
  },
): Run {
  const command =
    kitHookEntries(readSettings(repositoryRoot), event).flatMap(({ hooks }) => hooks ?? [])[0]
      ?.command ?? "";
  const run = spawnSync("sh", ["-c", command], {
    cwd,
    input: JSON.stringify({ hook_event_name: event, cwd, ...payload }),
    encoding: "utf8",
    env: { ...process.env, PATH: path, CLAUDE_PROJECT_DIR: projectDirectory },
  });
  return { status: run.status, stderr: run.stderr };
}

function runHooks(
  event: KitHookEvent,
  payload: Record<string, unknown>,
  { path, cwd }: { path: string; cwd: string },
): Run & { stdout: string } {
  const tool = typeof payload.tool_name === "string" ? payload.tool_name : "";
  const runs = (readSettings(repositoryRoot).hooks?.[event] ?? [])
    .filter(({ matcher }) => matcher === undefined || new RegExp(`^(?:${matcher})$`).test(tool))
    .flatMap(({ hooks }) => hooks ?? [])
    .map(({ command }) =>
      spawnSync("sh", ["-c", command ?? ""], {
        cwd,
        input: JSON.stringify({ hook_event_name: event, cwd, ...payload }),
        encoding: "utf8",
        env: { ...process.env, PATH: path, CLAUDE_PROJECT_DIR: repositoryRoot },
      }),
    );
  return {
    status: runs.some((run) => run.status === blocking)
      ? blocking
      : (runs.find((run) => run.status !== 0)?.status ?? 0),
    stdout: runs.map((run) => run.stdout).join(""),
    stderr: runs.map((run) => run.stderr).join(""),
  };
}

function shell(command: string): Record<string, unknown> {
  return { tool_name: "Bash", tool_input: { command } };
}

function written(file: string): Record<string, unknown> {
  return {
    tool_name: "Write",
    tool_input: { file_path: file, content: readFileSync(file, "utf8") },
  };
}

test(`the guidance the kit installs for Claude Code is exactly what ${syncScript} writes with the kit the catalog pins`, async () => {
  const outputs = await inTemporaryTree({}, (root) => {
    seedCheckout(root, []);
    syncAgentKit(root);
    return filesIn(root).filter((path) => path !== manifest && path !== installed);
  });
  const inKitDirectories = kitInstalls(repositoryRoot, "skills")
    .flatMap((name) => [`${sharedSkills}/${name}`, `${claudeSkills}/${name}`])
    .filter((path) => existsSync(join(repositoryRoot, path)))
    .flatMap((path) =>
      lstatSync(join(repositoryRoot, path)).isDirectory() ? filesIn(repositoryRoot, path) : [path],
    );
  const synced = await inTemporaryTree({}, (root) => {
    seedCheckout(root, outputs);
    syncAgentKit(root);
    return new Map(outputs.map((path) => [path, contentOf(root, path)]));
  });
  const stale = [...new Set([...outputs, ...inKitDirectories])]
    .filter(
      (path) =>
        !existsSync(join(repositoryRoot, path)) ||
        synced.get(path) !== contentOf(repositoryRoot, path),
    )
    .map(
      (path) =>
        `${path}: it is not what node ${syncScript} writes with solid2-agent-kit ${kitVersion(repositoryRoot)}, the release the catalog pins. Run it and commit what it writes; change the kit's guidance only through the kit.`,
    );

  expect(outputs).toContain(settingsFile);
  expect(stale).toEqual([]);
});

describe.each(nodesOnPath())("the kit's hooks under %s", (node) => {
  const path = `${dirname(node)}:/usr/bin:/bin`;

  test.each([".", subdirectory])(
    "run from the project directory when the session is in %s",
    async (directory) => {
      const cwd = join(repositoryRoot, directory);
      await inTemporaryTree(
        {
          "React.tsx": read(reactFixture),
          "Solid.tsx": 'import { createSignal } from "solid-js";\nexport const n = createSignal;\n',
        },
        (root) => {
          const hook = (event: KitHookEvent, payload: Record<string, unknown>) =>
            runHooks(event, payload, { path, cwd });
          const clean = { status: 0, stdout: "", stderr: "" };
          const tamper = hook("PreToolUse", {
            tool_name: "Write",
            tool_input: { file_path: join(repositoryRoot, kitSkill, "SKILL.md"), content: "" },
          });
          const install = hook("PreToolUse", shell("pnpm add react"));
          const reported = hook("PostToolUse", written(join(root, "React.tsx")));

          expect(tamper.status).toBe(blocking);
          expect(tamper.stderr).toContain(kitGuardrail);
          expect(install.status).toBe(0);
          expect(install.stdout).toContain(refusals.bannedDependency);
          expect(readOnlyCommands.map((command) => hook("PreToolUse", shell(command)))).toEqual(
            readOnlyCommands.map(() => clean),
          );
          expect(reported.status).toBe(blocking);
          expect(reported.stderr).toContain("[react-import]");
          expect(hook("PostToolUse", written(join(root, "Solid.tsx")))).toEqual(clean);
          expect(hook("Stop", { stop_hook_active: false })).toEqual(clean);
        },
      );
    },
  );
});

describe("the kit's hooks fail closed", () => {
  test("a node on PATH that cannot run the kit blocks a tool call, or reports after one, and leaves a turn free to end", async () => {
    await inTemporaryTree(
      { "bin/node": "#!/bin/sh\necho 'SyntaxError: an older Node' >&2\nexit 1\n" },
      (root) => {
        chmodSync(join(root, "bin/node"), 0o755);
        const path = `${join(root, "bin")}:/usr/bin:/bin`;
        const before = runKitHook("PreToolUse", shell(`rm -rf ${kitSkill}`), { path });
        const after = runKitHook("PostToolUse", shell("true"), { path });
        const stop = runKitHook("Stop", { stop_hook_active: false }, { path });

        expect(before.status).toBe(blocking);
        expect(before.stderr).toContain(kitHookDidNotRun);
        expect(after.status).toBe(blocking);
        expect(after.stderr).toContain(kitHookDidNotRun);
        expect(stop.status).not.toBe(blocking);
        expect(stop.status).not.toBe(0);
      },
    );
  });

  test("a checkout with no kit installed, such as one before its install, lets every tool call run and says so", async () => {
    await inTemporaryTree({}, (root) => {
      const path = process.env.PATH ?? "";
      const runs = [
        runKitHook("PreToolUse", shell("pnpm install"), { path, projectDirectory: root }),
        runKitHook("PostToolUse", shell("pnpm install"), { path, projectDirectory: root }),
        runKitHook("Stop", { stop_hook_active: false }, { path, projectDirectory: root }),
      ];

      expect(runs).toEqual(runs.map(() => ({ status: 0, stderr: `${kitNotInstalled}\n` })));
    });
  });
});

test(`${workspaceFile} approves neither skill of solid-js's that the kit's solid-2 skill replaces`, () => {
  const replaced = approvedSkills()
    .filter(({ pack, name }) =>
      replacedByTheKit.some((skill) => skill.pack === pack && skill.name === name),
    )
    .map(
      ({ pack, name }) =>
        `${pack} ${name}: the kit's solid-2 skill and the rules in CLAUDE.md say what it says. Leave it out of permissions in ${workspaceFile}.`,
    );

  expect(replaced).toEqual([]);
});

test("step 4 of open-pull-request runs every command the kit installs, next to Thermos", () => {
  const step = reviewStep.exec(read(openPullRequest))?.[1] ?? "";
  const missing = kitInstalls(repositoryRoot, "commands")
    .filter((command) => !step.includes(`/${command}`) || !step.includes(commandFile(command)))
    .map(
      (command) =>
        `${openPullRequest}: in step 4, next to Thermos, run /${command} and say to follow ${commandFile(command)} where a slash command cannot start.`,
    );

  const lintSolid: unknown = Reflect.get(JSON.parse(read(manifest)).scripts ?? {}, lintScript);

  expect(step).toContain("Thermos");
  expect(missing).toEqual([]);
  expect(step).toContain(`\`vp run ${lintScript}\``);
  expect(lintSolid).toMatch(/^solid2-kit check --dir \. && solid2-kit doctor$/);
});

test(`AGENTS.md sends agents to ${solidCheatsheet} for what the kit's skill does not name`, () => {
  const kitText = filesIn(join(repositoryRoot, kitPackage, "files"))
    .filter((path) => path.endsWith(".md"))
    .map((path) => readFileSync(join(repositoryRoot, kitPackage, "files", path), "utf8"))
    .join("\n");
  const row = read("AGENTS.md")
    .split("\n")
    .find((line) => line.startsWith("| ") && line.includes(`\`${solidCheatsheet}\``));

  expect(row, `AGENTS.md: add a row that sends agents to ${solidCheatsheet}.`).toBeDefined();
  expect(onlyInTheCheatsheet.filter((name) => !row?.includes(`\`${name}\``))).toEqual([]);
  expect(onlyInTheCheatsheet.filter((name) => !read(solidCheatsheet).includes(name))).toEqual([]);
  expect(onlyInTheCheatsheet.filter((name) => kitText.includes(name))).toEqual([]);
});
