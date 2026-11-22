import { spawnSync } from "node:child_process";

export type GitCommit = { sha: string; subject: string; parents: string[]; files: string[] };
export type ChangedLines = { removed: string[]; added: string[] };

const nulByte = "\0";

export function gitRun(args: readonly string[]): { status: number | null; stdout: string } {
  const run = spawnSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { status: run.status, stdout: run.stdout };
}

export function git(args: readonly string[]): string {
  const run = gitRun(args);
  if (run.status !== 0) throw new Error(`git ${args.join(" ")} failed with status ${run.status}.`);
  return run.stdout;
}

export function filesOf(output: string): string[] {
  return output.split(nulByte).filter((path) => path.length > 0);
}

export function changedLinesOf(sha: string, file: string): ChangedLines {
  const patch = git([
    "diff-tree",
    "-p",
    "-U0",
    "--no-renames",
    "--no-commit-id",
    "-r",
    "--root",
    sha,
    "--",
    file,
  ]).split("\n");
  const firstHunk = patch.findIndex((line) => line.startsWith("@@"));
  if (firstHunk === -1) return { removed: [], added: [] };
  const content = patch.slice(firstHunk).filter((line) => !line.startsWith("@@"));
  return {
    removed: content.filter((line) => line.startsWith("-")).map((line) => line.slice(1)),
    added: content.filter((line) => line.startsWith("+")).map((line) => line.slice(1)),
  };
}

export function commitsBetween(base: string, head: string): GitCommit[] {
  return git(["rev-list", `${base}..${head}`])
    .split("\n")
    .filter((sha) => sha.length > 0)
    .map((sha) => {
      const [subject = "", parentList = ""] = git(["log", "-1", "--format=%s%n%P", sha]).split(
        "\n",
      );
      const parents = parentList.split(" ").filter((parent) => parent.length > 0);
      const files = filesOf(
        parents.length > 2
          ? git(["diff-tree", "--cc", "--no-commit-id", "--name-only", "--no-renames", "-z", sha])
          : parents.length === 2
            ? git([
                "show",
                "--no-show-signature",
                "--remerge-diff",
                "--format=",
                "--name-only",
                "--no-renames",
                "-z",
                sha,
              ])
            : git([
                "diff-tree",
                "-r",
                "--root",
                "--no-commit-id",
                "--name-only",
                "--no-renames",
                "-z",
                sha,
              ]),
      );
      return { sha, subject, parents, files };
    });
}
