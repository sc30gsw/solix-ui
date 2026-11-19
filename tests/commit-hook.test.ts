import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { gitInScratchRepository } from "#/tests/support/git.ts";
import { inTemporaryTree } from "#/tests/support/temporary-tree.ts";
import { repositoryRoot } from "#/tests/support/workspace.ts";

const hookFile = ".vite-hooks/pre-commit";
const checkerFile = "scripts/check-working-tree.ts";
const runsHooksAsTheDispatcherDoes = "#!/bin/sh -e\n";
const stagedRun = "staged --no-stash";
const verifyRun = "run verify";

const recordingVp = `#!/bin/sh
printf '%s\\n' "$*" >> "$VP_CALLS"
if [ "$1" = staged ] && [ -n "$STAGED_DOES" ]; then sh -c "$STAGED_DOES"; fi
`;

type Commit = {
  arrange: (git: (...args: string[]) => string, root: string) => void;
  commitArgs?: string[];
  stagedDoes?: string;
};

type Outcome = { committed: boolean; vpCalls: string[]; said: string };

function attempt({ arrange, commitArgs = [], stagedDoes = "" }: Commit): Promise<Outcome> {
  return inTemporaryTree(
    {
      [checkerFile]: readFileSync(join(repositoryRoot, checkerFile), "utf8"),
      ".gitignore": "ignored.log\n",
      "file.txt": "base\n",
      "other.txt": "base\n",
    },
    (root) => {
      const git = (...args: string[]) => gitInScratchRepository(root, args);
      git("init", "--quiet", "--initial-branch=main");
      git("add", ".");
      git("commit", "--quiet", "--message=base");
      const base = git("rev-parse", "HEAD");
      const hooks = join(root, ".git/test-hooks");
      const bin = join(root, ".git/test-bin");
      mkdirSync(hooks);
      mkdirSync(bin);
      writeFileSync(
        join(hooks, "pre-commit"),
        runsHooksAsTheDispatcherDoes + readFileSync(join(repositoryRoot, hookFile), "utf8"),
      );
      writeFileSync(join(bin, "vp"), recordingVp);
      chmodSync(join(hooks, "pre-commit"), 0o755);
      chmodSync(join(bin, "vp"), 0o755);
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
          "commit",
          "--message=change",
          ...commitArgs,
        ],
        {
          cwd: root,
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            VP_CALLS: calls,
            STAGED_DOES: stagedDoes,
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
