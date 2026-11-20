import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
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
  kitNotInstalled,
  kitPackage,
  kitVersion,
  readSettings,
  settingsFile,
  syncAgentKit,
  syncScript,
} from "#/scripts/agent-kit.ts";
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
const installed = "node_modules";
const restatedShare = 0.8;
const codeName = /`([A-Za-z_$][\w$.]*)/g;

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

function seedCheckout(root: string, paths: readonly string[]): void {
  symlinkSync(join(repositoryRoot, installed), join(root, installed));
  for (const path of [manifest, ...paths].filter((file) =>
    existsSync(join(repositoryRoot, file)),
  )) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    cpSync(join(repositoryRoot, path), join(root, path));
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
    .map((name) => `.claude/skills/${name}`)
    .filter((directory) => existsSync(join(repositoryRoot, directory)))
    .flatMap((directory) => filesIn(repositoryRoot, directory));
  const synced = await inTemporaryTree({}, (root) => {
    seedCheckout(root, outputs);
    syncAgentKit(root);
    return new Map(outputs.map((path) => [path, readFileSync(join(root, path), "utf8")]));
  });
  const stale = [...new Set([...outputs, ...inKitDirectories])]
    .filter((path) => !existsSync(join(repositoryRoot, path)) || synced.get(path) !== read(path))
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
            runKitHook(event, payload, { path, cwd });
          const tamper = hook("PreToolUse", shell(`rm -rf ${kitSkill}`));
          const install = hook("PreToolUse", shell("pnpm add react"));
          const reported = hook("PostToolUse", written(join(root, "React.tsx")));

          expect(tamper.status).toBe(blocking);
          expect(tamper.stderr).toContain(kitGuardrail);
          expect(install.status).toBe(blocking);
          expect(install.stderr).toContain(kitGuardrail);
          expect(hook("PreToolUse", shell("git status"))).toEqual({ status: 0, stderr: "" });
          expect(reported.status).toBe(blocking);
          expect(reported.stderr).toContain("[react-import]");
          expect(hook("PostToolUse", written(join(root, "Solid.tsx")))).toEqual({
            status: 0,
            stderr: "",
          });
          expect(hook("Stop", { stop_hook_active: false })).toEqual({ status: 0, stderr: "" });
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

test(`no package skill that ${workspaceFile} approves restates the kit's solid-2 skill and rules`, () => {
  const kitText = filesIn(join(repositoryRoot, kitPackage, "files"))
    .filter((path) => path.endsWith(".md"))
    .map((path) => readFileSync(join(repositoryRoot, kitPackage, "files", path), "utf8"))
    .join("\n");
  const restating = approvedSkills().flatMap(({ pack, name }) => {
    const text = readFileSync(
      join(repositoryRoot, installed, pack, "skills", name, "SKILL.md"),
      "utf8",
    );
    const names = [...new Set([...text.matchAll(codeName)].map(([, found]) => found))];
    const share = names.filter((found) => kitText.includes(found)).length / names.length;
    return share < restatedShare
      ? []
      : [
          `${pack} ${name}: ${Math.round(share * 100)}% of the code names it writes are in the kit's solid-2 skill and rules, so it restates them. Leave it out of permissions in ${workspaceFile}: the kit's skill is the source.`,
        ];
  });

  expect(approvedSkills().length).toBeGreaterThan(0);
  expect(restating).toEqual([]);
});
