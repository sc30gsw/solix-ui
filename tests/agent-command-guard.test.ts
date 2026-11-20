import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { pathToFileURL } from "node:url";
import { kitPackage } from "#/scripts/agent-kit.ts";
import {
  bannedDependencies,
  guardHookCommand,
  newestSolidOneMajors,
  type Refusal,
  refusals,
  refusalsOf,
} from "#/scripts/agent-command-guard.ts";
import { parse, ts } from "#/scripts/syntax.ts";
import { inTemporaryTree } from "#/tests/support/temporary-tree.ts";
import { repositoryRoot } from "#/tests/support/workspace.ts";

const settingsFile = ".claude/settings.json";
const guardEvent = "PreToolUse";
const guardedTool = "Bash";
const guardFile = "scripts/agent-command-guard.ts";
const blocking = 2;
const stash = { tool_name: "Bash", tool_input: { command: "git stash" } };

const refused: [Refusal, string[]][] = [
  [
    "stash",
    [
      "git stash",
      "git stash pop",
      "cd packages/core && git -C ../.. stash push -m wip",
      "/usr/bin/git --no-pager stash list",
      "ls $(git stash list)",
      'echo "$(git stash show)"',
      "bash -c 'git stash'",
      "eval git stash",
      "true; git\\\n stash",
      "bash <<< 'git stash'",
      "echo git stash | bash",
      "printf 'git stash' | sh",
      "bash <<'EOF'\ngit stash\nEOF",
    ],
  ],
  [
    "hooksSkipped",
    [
      "git commit --no-verify -m 'feat: x'",
      "git commit -n -m 'feat: x'",
      "git commit -anm 'feat: x'",
      "git commit --no-veri -m x",
      "flock /tmp/solix-test.lock git commit -a -n -m x",
      "git -c user.name=x commit -n",
      "sh -c 'git commit -n -m x'",
      "HUSKY=0 git commit -m x",
      "VP_GIT_HOOKS=0 git commit -m x",
      "export VITE_GIT_HOOKS=0 && git commit -m x",
      "HUSKY=0 bash -c 'git commit -m x'",
      "git -ccore.hooksPath=x commit -m x",
      "git --config-env=core.hooksPath=HOOKS commit -m x",
      "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null git commit -m x",
      "export GIT_CONFIG_PARAMETERS=\"'core.hooksPath'='x'\"; git merge main",
      "git merge --no-veri main",
      "git pull --no-verify origin main",
      "env HUSKY=0 git merge main",
      "git -c core.hooksPath=/dev/null commit -m x",
      "git -c CORE.HOOKSPATH=x merge main",
      "git config core.hooksPath /dev/null",
      "git config --unset core.hooksPath",
      "git config set core.hooksPath x",
      "git merge --no-verify main",
    ],
  ],
  [
    "playwrightInstall",
    [
      "vp exec playwright install chromium",
      "npx playwright install --with-deps",
      "pnpm exec playwright@1.0.0 install",
      "node node_modules/playwright/cli.js install webkit",
      "PLAYWRIGHT_BROWSERS_PATH=/tmp/x node_modules/.bin/playwright install",
      "node node_modules/playwright-core/cli.js install",
      "node node_modules/@playwright/test/cli.js install",
      "node_modules/playwright/lib/cli/cli.js install chromium",
    ],
  ],
  [
    "releaseAge",
    [
      "pnpm config set minimumReleaseAge 0",
      "pnpm config set minimum-release-age=0 --location=project",
      "pnpm config delete minimumReleaseAgeStrict",
      "pnpm install --config.minimumReleaseAgeExclude=solid-js",
      "pnpm add solid-js --minimum-release-age=0",
      "npm_config_minimum_release_age=0 pnpm install",
      "CI=1 pnpm_config_trust_lockfile=true pnpm install",
      "export npm_config_minimum_release_age_exclude=solid-js",
      "env PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 pnpm install",
      "pnpm install --trust-lockfile",
      "sed -i 's/minimumReleaseAge: 1440/minimumReleaseAge: 0/' pnpm-workspace.yaml",
      "printf 'minimumReleaseAgeExclude:\\n  - solid-js\\n' >> pnpm-workspace.yaml",
      "echo 'trust-lockfile=true' | tee -a .npmrc",
      "cat >> pnpm-workspace.yaml <<'EOF'\nminimumReleaseAgeExclude:\n  - solid-js\nEOF",
    ],
  ],
  [
    "bannedDependency",
    [
      "pnpm add react",
      "npm install react-dom@19.0.0",
      "pnpm --filter @solix/core add -D vite-plugin-solid",
      "yarn add --dev eslint-plugin-solid",
      "npm i @solidjs/start",
      "yarn global add vinxi",
      "vp add next",
      "bun add solid-app-router",
      "pnpm add solid-js@1.9.5",
      "pnpm add '@solidjs/router@^0.15.0'",
      "npm install @tanstack/solid-query@5",
      "flock /tmp/solix-test.lock pnpm add react",
      "bash -c 'pnpm add react'",
    ],
  ],
];

const allowed = [
  "git status",
  "git stash-like-name",
  "git log --oneline -5",
  "git commit -m 'fix: never git stash, never --no-verify'",
  "git commit -mn",
  "git commit -m -n",
  "git commit -F msg.txt -- -n",
  "git commit --no-edit --amend",
  "git commit -m \"$(cat <<'EOF'\nfix: a ) paren, git stash and -n\n\nCo-Authored-By: x\nEOF\n)\"",
  "git commit -F- <<EOF\nfix: git stash words in a message\nEOF",
  "echo git stash",
  "grep -rn 'git stash' .",
  "vp exec playwright test",
  "npx playwright --version",
  "vp exec playwright install-deps",
  "pnpm config get minimumReleaseAge",
  "grep -n minimumReleaseAge pnpm-workspace.yaml",
  "pnpm install --frozen-lockfile",
  "echo minimumReleaseAge > notes.md",
  "sed -i 's/a/b/' pnpm-workspace.yaml",
  "vp test 2>&1 | tee ../run.log",
  "flock /tmp/solix-test.lock vp run verify",
  "HUSKY=2 git commit -m x",
  "git -c core.hooksPath=/dev/null log",
  "git config core.hooksPath",
  "git config --get core.hooksPath",
  "vp config",
  "git merge -n main",
  "git merge --no-verify-signatures main",
  "git commit -uno -m x",
  "git commit -Skey -m x",
  "git diff main -- pnpm-workspace.yaml | grep minimumReleaseAge",
  "grep minimumReleaseAge pnpm-workspace.yaml > /tmp/out",
  "cp pnpm-workspace.yaml /tmp/x && grep minimumReleaseAge /tmp/x",
  "echo git stash | grep stash",
  "HUSKY=0 pnpm install",
  "export VITE_GIT_HOOKS=0",
  "git -cuser.name=x commit -m y",
  "git --config-env=user.name=NAME commit -m y",
  "git pull",
  "pnpm add solid-js@2.0.1",
  "pnpm add @solidjs/router@2",
  "npm install @tanstack/solid-query@6",
  "pnpm why react",
  "cat node_modules/react/package.json",
  "grep -n react package.json",
  "echo pnpm add react",
  "pnpm add reactivity-helpers",
];

describe("the agent command guard", () => {
  test.each(refused.flatMap(([refusal, lines]) => lines.map((line) => [refusal, line] as const)))(
    "refuses %s in %j",
    (refusal, line) => {
      expect(refusalsOf(line, false)).toEqual([refusal]);
    },
  );

  test.each(allowed)("allows %j", (line) => {
    expect(refusalsOf(line, false)).toEqual([]);
  });

  test("reads a chain of evals in time linear in its length", () => {
    const started = performance.now();

    expect(refusalsOf(`${"eval ".repeat(22)}git stash`, false)).toEqual(["stash"]);
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  test("allows playwright install in CI, and still refuses the rest there", () => {
    expect(refusalsOf("vp exec playwright install chromium", true)).toEqual([]);
    expect(refusalsOf("git stash && git commit -n", true)).toEqual(["stash", "hooksSkipped"]);
  });
});

type HookEntry = { matcher?: string; hooks?: { type?: string; command?: string }[] };

type GuardRun = { status: number | null; stdout: string; stderr: string };

function guardEntries(): HookEntry[] {
  const settings = JSON.parse(readFileSync(join(repositoryRoot, settingsFile), "utf8")) as {
    hooks?: Record<string, HookEntry[]>;
  };
  return (settings.hooks?.[guardEvent] ?? []).filter(({ matcher }) => matcher === guardedTool);
}

function wiredCommand(): string {
  return guardEntries().flatMap(({ hooks }) => hooks ?? [])[0]?.command ?? "";
}

function runGuard(
  input: string,
  environment: Record<string, string> = {},
  projectDirectory = repositoryRoot,
): GuardRun {
  const run = spawnSync("sh", ["-c", wiredCommand()], {
    input,
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDirectory, CI: "", ...environment },
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

function guardOutput(event: unknown): string {
  const run = runGuard(JSON.stringify(event));
  expect(run.stderr).toBe("");
  expect(run.status).toBe(0);
  return run.stdout;
}

test("settings.json runs the guard before every Bash command, in an entry of its own, and the guard denies with its reason and says nothing otherwise", () => {
  expect(guardEntries()).toEqual([
    { matcher: guardedTool, hooks: [{ type: "command", command: guardHookCommand }] },
  ]);
  expect(JSON.parse(guardOutput(stash))).toEqual({
    hookSpecificOutput: {
      hookEventName: guardEvent,
      permissionDecision: "deny",
      permissionDecisionReason: refusals.stash,
    },
  });
  expect(guardOutput({ tool_name: guardedTool, tool_input: { command: "git status" } })).toBe("");
  expect(guardOutput({ tool_name: "Read", tool_input: { file_path: "git stash" } })).toBe("");
});

describe("the guard fails closed", () => {
  test("a node on PATH that cannot run the guard blocks the command", async () => {
    await inTemporaryTree(
      { "bin/node": "#!/bin/sh\necho 'SyntaxError: an older Node' >&2\nexit 1\n" },
      (root) => {
        chmodSync(join(root, "bin/node"), 0o755);
        const run = runGuard(JSON.stringify(stash), { PATH: `${join(root, "bin")}:/usr/bin:/bin` });

        expect(run.status).toBe(blocking);
        expect(run.stderr).toContain("the command is refused");
      },
    );
  });

  test("a guard that throws blocks the command and says why", async () => {
    await inTemporaryTree({}, (root) => {
      mkdirSync(join(root, "scripts"));
      writeFileSync(join(root, guardFile), 'throw new Error("the guard broke");\n');
      const crashed = runGuard(JSON.stringify(stash), {}, root);
      const unreadable = runGuard("not an event");

      expect(crashed.status).toBe(blocking);
      expect(crashed.stderr).toContain("the command is refused");
      expect(unreadable.status).toBe(blocking);
      expect(unreadable.stderr).toContain("the command is refused");
    });
  });

  test("a project directory reached through a symbolic link still runs the guard", async () => {
    await inTemporaryTree({}, (root) => {
      const linked = join(root, "linked-checkout");
      symlinkSync(repositoryRoot, linked);
      const run = runGuard(JSON.stringify(stash), {}, linked);

      expect(run.status).toBe(0);
      expect(JSON.parse(run.stdout || "{}")).toMatchObject({
        hookSpecificOutput: { permissionDecision: "deny" },
      });
    });
  });

  test("a checkout with no guard, such as a commit from before it, lets the command run and says so", async () => {
    await inTemporaryTree({}, (root) => {
      const run = runGuard(JSON.stringify(stash), {}, root);

      expect(run.status).toBe(0);
      expect(run.stdout).toBe("");
      expect(run.stderr).toContain("has no command guard");
    });
  });

  test("the guard imports only Node's own modules, so any Node that strips types runs it, whatever it makes of subpath imports", () => {
    const imported = parse(join(repositoryRoot, guardFile))
      .statements.filter(ts.isImportDeclaration)
      .map(({ moduleSpecifier }) =>
        ts.isStringLiteral(moduleSpecifier) ? moduleSpecifier.text : "",
      )
      .filter((specifier) => !specifier.startsWith("node:"));

    expect(imported).toEqual([]);
  });
});

type Finding = { id: string; message: string };

async function kitDoctor(): Promise<{
  banned: string[];
  findings: (dependencies: Record<string, string>) => Finding[];
}> {
  const doctor: unknown = await import(
    pathToFileURL(join(repositoryRoot, kitPackage, "bin/doctor.mjs")).href
  );
  const banned: unknown = Reflect.get(Object(doctor), "BANNED_DEPS");
  const findingsOf: unknown = Reflect.get(Object(doctor), "doctorFindings");
  if (typeof findingsOf !== "function") throw new Error("the kit's doctor has no doctorFindings.");
  return {
    banned: Object.keys(Object(banned)),
    findings: (dependencies) =>
      inTemporaryTreeSync(dependencies, (root) => Reflect.apply(findingsOf, undefined, [root])),
  };
}

function inTemporaryTreeSync<T>(dependencies: Record<string, string>, use: (root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), "kit-doctor-"));
  try {
    writeFileSync(join(root, "package.json"), JSON.stringify({ devDependencies: dependencies }));
    return use(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("the guard refuses an install of exactly the packages the kit's doctor bans, and of the Solid 1.x lines it fails on", async () => {
  const doctor = await kitDoctor();
  const solidOneLine = (name: string, range: string) =>
    doctor
      .findings({ [name]: range })
      .some(({ message }) => message.includes("the Solid 1.x line"));

  expect([...bannedDependencies].sort()).toEqual([...doctor.banned].sort());
  for (const [name, major] of newestSolidOneMajors) {
    expect(solidOneLine(name, `^${major}.0.0`), `${name}@${major}`).toBe(true);
    expect(solidOneLine(name, `^${major + 1}.0.0`), `${name}@${major + 1}`).toBe(false);
  }
});
