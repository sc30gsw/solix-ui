import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { type Refusal, refusals, refusalsOf } from "#/scripts/agent-command-guard.ts";
import { repositoryRoot } from "#/tests/support/workspace.ts";

const settingsFile = ".claude/settings.json";
const guardEvent = "PreToolUse";
const guardedTool = "Bash";
const guardCommand = 'node "$CLAUDE_PROJECT_DIR/scripts/check-agent-command.ts"';

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
    ],
  ],
  [
    "noVerify",
    [
      "git commit --no-verify -m 'feat: x'",
      "git commit -n -m 'feat: x'",
      "git commit -anm 'feat: x'",
      "git commit --no-veri -m x",
      "flock /tmp/solix-test.lock git commit -a -n -m x",
      "git -c user.name=x commit -n",
      "sh -c 'git commit -n -m x'",
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

  test("allows playwright install in CI, and still refuses the rest there", () => {
    expect(refusalsOf("vp exec playwright install chromium", true)).toEqual([]);
    expect(refusalsOf("git stash && git commit -n", true)).toEqual(["stash", "noVerify"]);
  });
});

type HookEntry = { matcher?: string; hooks?: { type?: string; command?: string }[] };

function guardOutput(event: unknown): string {
  const run = spawnSync("sh", ["-c", guardCommand], {
    input: JSON.stringify(event),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: repositoryRoot, CI: "" },
  });
  expect(run.stderr).toBe("");
  expect(run.status).toBe(0);
  return run.stdout;
}

test("settings.json runs the guard before every Bash command, in an entry of its own, and the guard denies with its reason and says nothing otherwise", () => {
  const settings = JSON.parse(readFileSync(join(repositoryRoot, settingsFile), "utf8")) as {
    hooks?: Record<string, HookEntry[]>;
  };
  const entries = (settings.hooks?.[guardEvent] ?? []).filter((entry) =>
    entry.hooks?.some((hook) => hook.command === guardCommand),
  );

  expect(entries).toEqual([
    { matcher: guardedTool, hooks: [{ type: "command", command: guardCommand }] },
  ]);
  expect(
    JSON.parse(guardOutput({ tool_name: guardedTool, tool_input: { command: "git stash" } })),
  ).toEqual({
    hookSpecificOutput: {
      hookEventName: guardEvent,
      permissionDecision: "deny",
      permissionDecisionReason: refusals.stash,
    },
  });
  expect(guardOutput({ tool_name: guardedTool, tool_input: { command: "git status" } })).toBe("");
  expect(guardOutput({ tool_name: "Read", tool_input: { file_path: "git stash" } })).toBe("");
});
