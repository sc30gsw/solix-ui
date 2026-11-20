import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vite-plus/test";
import { gitInScratchRepository } from "#/tests/support/git.ts";
import { inTemporaryTree } from "#/tests/support/temporary-tree.ts";
import { repositoryRoot } from "#/tests/support/workspace.ts";

const hookFiles = [".vite-hooks/pre-commit", ".vite-hooks/pre-merge-commit"];
const checkerFile = "scripts/check-working-tree.ts";
const mergedCommitsFile = "scripts/merged-commits.ts";
const skillConfirmationsFile = "scripts/skill-confirmations.ts";
const confirmedSkill = "verify-example";
const unconfirmed = `.agents/skills/${confirmedSkill}/SKILL.md: it was last confirmed against`;
const mergeSide = ["merge", "--no-ff", "--message=merge side", "side"];
const runsHooksAsTheDispatcherDoes = "#!/bin/sh -e\n";
const stagedRun = "staged --no-stash";
const verifyRun = "run verify";

const recordingVp = `#!/bin/sh
printf '%s\\n' "$*" >> "$VP_CALLS"
if [ "$1" = staged ] && [ -n "$STAGED_DOES" ]; then sh -c "$STAGED_DOES" || exit; fi
if [ "$1" = run ] && [ -n "$VERIFY_DOES" ]; then sh -c "$VERIFY_DOES" || exit; fi
`;

const checksTheSkillConfirmation = `import { unconfirmedSkills } from ${JSON.stringify(
  pathToFileURL(join(repositoryRoot, skillConfirmationsFile)).href,
)};
const problems = unconfirmedSkills(process.cwd(), [${JSON.stringify(confirmedSkill)}], process.env);
for (const problem of problems) console.error(problem);
process.exitCode = problems.length === 0 ? 0 : 1;
`;

type Git = (...args: string[]) => string;

type Commit = {
  arrange: (git: Git, root: string) => void;
  commitArgs?: string[];
  stagedDoes?: string;
  checksSkills?: boolean;
  merges?: readonly string[];
  side?: (git: Git, root: string) => void;
};

type Outcome = { committed: boolean; vpCalls: string[]; said: string };

function attempt({
  arrange,
  commitArgs = [],
  stagedDoes = "",
  checksSkills = false,
  merges,
  side = (git, root) => {
    changed(root, "file.txt");
    git("commit", "--quiet", "--all", "--message=side");
  },
}: Commit): Promise<Outcome> {
  return inTemporaryTree(
    {
      [checkerFile]: readFileSync(join(repositoryRoot, checkerFile), "utf8"),
      [mergedCommitsFile]: readFileSync(join(repositoryRoot, mergedCommitsFile), "utf8"),
      ".gitignore": "ignored.log\n",
      "file.txt": "base\n",
      "other.txt": "base\n",
    },
    (root) => {
      const git = (...args: string[]) => gitInScratchRepository(root, args);
      git("init", "--quiet", "--initial-branch=main");
      git("add", ".");
      git("commit", "--quiet", "--message=base");
      if (merges) {
        git("switch", "--quiet", "--create", "side");
        side(git, root);
        git("switch", "--quiet", "main");
      }
      const base = git("rev-parse", "HEAD");
      const hooks = join(root, ".git/test-hooks");
      const bin = join(root, ".git/test-bin");
      mkdirSync(hooks);
      mkdirSync(bin);
      for (const hookFile of hookFiles) {
        const hook = join(hooks, basename(hookFile));
        writeFileSync(
          hook,
          runsHooksAsTheDispatcherDoes + readFileSync(join(repositoryRoot, hookFile), "utf8"),
        );
        chmodSync(hook, 0o755);
      }
      writeFileSync(join(bin, "vp"), recordingVp);
      chmodSync(join(bin, "vp"), 0o755);
      const skillCheck = join(bin, "check-skills.mjs");
      writeFileSync(skillCheck, checksTheSkillConfirmation);
      const calls = join(root, ".git/vp-calls");
      arrange(git, root);
      const commit = spawnSync(
        "git",
        [
          "-c",
          "user.name=Test",
          "-c",
          "user.email=test@example.com",
          "-c",
          `core.hooksPath=${hooks}`,
          "-c",
          "commit.gpgsign=false",
          ...(merges ?? ["commit", "--message=change", ...commitArgs]),
        ],
        {
          cwd: root,
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            VP_CALLS: calls,
            STAGED_DOES: stagedDoes,
            VERIFY_DOES: checksSkills ? `node ${JSON.stringify(skillCheck)}` : "",
          },
        },
      );
      return {
        committed: git("rev-parse", "HEAD") !== base,
        vpCalls: existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n") : [],
        said: `${commit.stdout}${commit.stderr}`,
      };
    },
  );
}

function changed(root: string, file: string): void {
  writeFileSync(join(root, file), `${file} changed\n`);
}

describe("the pre-commit hook verifies exactly what the commit holds", () => {
  test("a commit whose working tree is its index runs vp staged without its stash backup, then verify", async () => {
    const outcome = await attempt({
      arrange: (git, root) => {
        changed(root, "file.txt");
        git("add", "file.txt");
      },
    });

    expect(outcome).toMatchObject({ committed: true, vpCalls: [stagedRun, verifyRun] });
  });

  test("an ignored file does not stop a commit", async () => {
    const outcome = await attempt({
      arrange: (git, root) => {
        changed(root, "file.txt");
        changed(root, "ignored.log");
        git("add", "file.txt");
      },
    });

    expect(outcome).toMatchObject({ committed: true, vpCalls: [stagedRun, verifyRun] });
  });

  test("commit --all stages every tracked change, so it commits what verify sees", async () => {
    const outcome = await attempt({
      arrange: (_, root) => {
        changed(root, "file.txt");
        changed(root, "other.txt");
      },
      commitArgs: ["--all"],
    });

    expect(outcome).toMatchObject({ committed: true, vpCalls: [stagedRun, verifyRun] });
  });

  test.each<[string, Commit, string]>([
    [
      "an unstaged change to another tracked file",
      {
        arrange: (git, root) => {
          changed(root, "file.txt");
          git("add", "file.txt");
          changed(root, "other.txt");
        },
      },
      "unstaged change: other.txt",
    ],
    [
      "a file staged and then changed again",
      {
        arrange: (git, root) => {
          changed(root, "file.txt");
          git("add", "file.txt");
          writeFileSync(join(root, "file.txt"), "changed again\n");
        },
      },
      "unstaged change: file.txt",
    ],
    [
      "an untracked file",
      {
        arrange: (git, root) => {
          changed(root, "file.txt");
          git("add", "file.txt");
          changed(root, "new.txt");
        },
      },
      "untracked file: new.txt",
    ],
    [
      "a commit of named paths while another tracked file is changed",
      {
        arrange: (_, root) => {
          changed(root, "file.txt");
          changed(root, "other.txt");
        },
        commitArgs: ["--", "file.txt"],
      },
      "unstaged change: other.txt",
    ],
  ])("%s stops the commit before vp runs", async (_, commit, said) => {
    const outcome = await attempt(commit);

    expect(outcome).toMatchObject({ committed: false, vpCalls: [] });
    expect(outcome.said).toContain(said);
  });

  test.each<[string, string, string]>([
    [
      "changes a file and leaves the change unstaged",
      "echo fixed >> file.txt",
      "unstaged change: file.txt",
    ],
    [
      "writes a file it does not stage",
      "echo written > written.txt",
      "untracked file: written.txt",
    ],
  ])("a vp staged that %s stops the commit before verify", async (_, stagedDoes, said) => {
    const outcome = await attempt({
      arrange: (git, root) => {
        changed(root, "file.txt");
        git("add", "file.txt");
      },
      stagedDoes,
    });

    expect(outcome).toMatchObject({ committed: false, vpCalls: [stagedRun] });
    expect(outcome.said).toContain(said);
  });

  test("a vp staged that fixes a file and stages the fix lets the commit through", async () => {
    const outcome = await attempt({
      arrange: (git, root) => {
        changed(root, "file.txt");
        git("add", "file.txt");
      },
      stagedDoes: "echo fixed >> file.txt && git add file.txt",
    });

    expect(outcome).toMatchObject({ committed: true, vpCalls: [stagedRun, verifyRun] });
  });
});

describe("the pre-merge-commit hook verifies exactly what the merge commit holds", () => {
  test("a merge whose working tree is its index runs verify", async () => {
    const outcome = await attempt({ arrange: () => undefined, merges: mergeSide });

    expect(outcome).toMatchObject({ committed: true, vpCalls: [verifyRun] });
  });

  test.each<[string, (root: string) => void, string]>([
    ["an unstaged change", (root) => changed(root, "other.txt"), "unstaged change: other.txt"],
    ["an untracked file", (root) => changed(root, "new.txt"), "untracked file: new.txt"],
  ])("a merge beside %s stops before verify runs", async (_, arrange, said) => {
    const outcome = await attempt({ arrange: (__, root) => arrange(root), merges: mergeSide });

    expect(outcome).toMatchObject({ committed: false, vpCalls: [] });
    expect(outcome.said).toContain(said);
  });

  const confirmingOnSide = (git: Git, root: string) => {
    changed(root, "file.txt");
    git("commit", "--quiet", "--all", "--message=side");
    const confirmed = git("rev-parse", "HEAD").trim();
    mkdirSync(join(root, ".agents/skills", confirmedSkill), { recursive: true });
    writeFileSync(
      join(root, ".agents/skills", confirmedSkill, "SKILL.md"),
      `Last confirmed against commit \`${confirmed}\`.\n`,
    );
    git("add", ".agents");
    git("commit", "--quiet", "--message=confirm the skill on side");
  };

  test.each<[string, readonly string[]]>([
    ["git merge", mergeSide],
    ["git pull", ["pull", "--no-rebase", "--no-ff", "--no-edit", ".", "side"]],
  ])(
    "%s whose merged commit holds a newer confirmation of a skill passes its hook, though git writes MERGE_HEAD only after the hook",
    async (_, merges) => {
      const outcome = await attempt({
        arrange: () => undefined,
        merges,
        side: confirmingOnSide,
        checksSkills: true,
      });

      expect(outcome.said).not.toContain(unconfirmed);
      expect(outcome).toMatchObject({ committed: true, vpCalls: [verifyRun] });
    },
  );

  test("a merge whose skill names a commit that neither HEAD nor the merged commit contains stops at verify", async () => {
    const outcome = await attempt({
      arrange: () => undefined,
      merges: mergeSide,
      side: (git, root) => {
        git("switch", "--quiet", "--create", "elsewhere");
        changed(root, "other.txt");
        git("commit", "--quiet", "--all", "--message=elsewhere");
        const elsewhere = git("rev-parse", "HEAD").trim();
        git("switch", "--quiet", "side");
        mkdirSync(join(root, ".agents/skills", confirmedSkill), { recursive: true });
        writeFileSync(
          join(root, ".agents/skills", confirmedSkill, "SKILL.md"),
          `Last confirmed against commit \`${elsewhere}\`.\n`,
        );
        git("add", ".agents");
        git("commit", "--quiet", "--message=confirm the skill elsewhere");
      },
      checksSkills: true,
    });

    expect(outcome).toMatchObject({ committed: false, vpCalls: [verifyRun] });
    expect(outcome.said).toContain(unconfirmed);
  });
});
