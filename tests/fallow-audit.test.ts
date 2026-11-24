import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { emptyChangesetProblems } from "#/scripts/fallow-audit.ts";
import { gitInScratchRepository } from "#/tests/support/git.ts";
import { inTemporaryTree } from "#/tests/support/temporary-tree.ts";
import { repositoryRoot } from "#/tests/support/workspace.ts";

const auditCheck = join(repositoryRoot, "scripts/check-fallow-audit.ts");
const project = {
  "package.json": '{ "name": "scratch", "private": true, "type": "module" }\n',
  "src/index.ts": 'import { used } from "./used.ts";\n\nconsole.log(used);\n',
  "src/used.ts": "export const used = 1;\n",
  "README.md": "A project.\n",
};

function onABranch(root: string, change: (root: string) => void): void {
  const git = (...args: string[]) => gitInScratchRepository(root, args);
  git("init", "--quiet", "--initial-branch=main");
  git("add", ".");
  git("commit", "--quiet", "--message=base");
  git("switch", "--quiet", "--create", "change");
  change(root);
  git("add", ".");
  git("commit", "--quiet", "--message=change");
}

function audited(root: string, ...args: string[]) {
  return spawnSync(process.execPath, [auditCheck, ...args], { cwd: root, encoding: "utf8" });
}

describe("emptyChangesetProblems", () => {
  test("fails an audit that read no changed file while git names some, and passes any other", () => {
    expect(emptyChangesetProblems(0, ["src/a.ts", "README.md"])).toEqual([
      "fallow audited no changed file, but git diff names 2: src/a.ts, README.md. The audit would pass without reading the change. Check the base it was given.",
    ]);
    expect(emptyChangesetProblems(0, [])).toEqual([]);
    expect(emptyChangesetProblems(2, ["src/a.ts", "README.md"])).toEqual([]);
  });
});

describe("the fallow audit check", () => {
  test("fails on an unused export the branch brings in, against its merge-base with the base it is given", async () => {
    await inTemporaryTree(project, (root) => {
      onABranch(root, (at) =>
        writeFileSync(
          join(at, "src/used.ts"),
          "export const used = 1;\nexport const unused = 2;\n",
        ),
      );
      const run = audited(root, "main");

      expect(run.status).toBe(1);
      expect(run.stdout).toContain("unused");
    });
  });

  test("passes a branch that brings in no error, a change to prose included", async () => {
    await inTemporaryTree(project, (root) => {
      onABranch(root, (at) => writeFileSync(join(at, "README.md"), "A small project.\n"));

      expect(audited(root, "main").status).toBe(0);
    });
  });

  test("ignores a cleanup landed on the base branch after the branch split", async () => {
    await inTemporaryTree(
      {
        ...project,
        "src/used.ts": "export const used = 1;\nexport const legacyUnused = 2;\n",
      },
      (root) => {
        onABranch(root, (at) => writeFileSync(join(at, "README.md"), "A small project.\n"));
        const git = (...args: string[]) => gitInScratchRepository(root, args);
        git("switch", "--quiet", "main");
        writeFileSync(join(root, "src/used.ts"), "export const used = 1;\n");
        git("add", ".");
        git("commit", "--quiet", "--message=main cleaned up legacyUnused");
        git("switch", "--quiet", "change");

        expect(audited(root, "main").status).toBe(0);
      },
    );
  });

  test("refuses an unstaged change, an untracked file and a staged change before it runs fallow", async () => {
    await inTemporaryTree(project, (root) => {
      onABranch(root, (at) => writeFileSync(join(at, "README.md"), "A small project.\n"));
      writeFileSync(join(root, "README.md"), "Changed again.\n");
      const unstaged = audited(root, "main");
      gitInScratchRepository(root, ["add", "README.md"]);
      const staged = audited(root, "main");
      gitInScratchRepository(root, ["commit", "--quiet", "--message=again"]);
      writeFileSync(join(root, "notes.txt"), "notes\n");
      const untracked = audited(root, "main");

      expect([unstaged.status, unstaged.stderr]).toEqual([
        1,
        expect.stringContaining("unstaged change: README.md"),
      ]);
      expect([staged.status, staged.stderr]).toEqual([
        1,
        expect.stringContaining("staged change: README.md"),
      ]);
      expect([untracked.status, untracked.stderr]).toEqual([
        1,
        expect.stringContaining("untracked file: notes.txt"),
      ]);
    });
  });

  test("says so when git finds no merge-base with the base it is given", async () => {
    await inTemporaryTree(project, (root) => {
      onABranch(root, (at) => writeFileSync(join(at, "README.md"), "A small project.\n"));
      const run = audited(root, "origin/main");

      expect(run.status).toBe(2);
      expect(run.stderr).toContain("git finds no merge-base of origin/main and HEAD");
    });
  });
});
