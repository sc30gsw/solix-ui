import { spawnSync } from "node:child_process";

export type GitCommit = { sha: string; subject: string; parents: string[]; files: string[] };

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

export function commitsBetween(base: string, head: string): GitCommit[] {
  return git(["rev-list", `${base}..${head}`])
    .split("\n")
    .filter((sha) => sha.length > 0)
    .map((sha) => {
      const [subject = "", parents = ""] = git(["log", "-1", "--format=%s%n%P", sha]).split("\n");
      return {
        sha,
        subject,
        parents: parents.split(" ").filter((parent) => parent.length > 0),
        files: filesOf(
          git([
            "diff-tree",
            "--no-commit-id",
            "--name-only",
            "--no-renames",
            "-r",
            "-z",
            "--root",
            sha,
          ]),
        ),
      };
    });
}
