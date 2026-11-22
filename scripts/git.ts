import { spawnSync } from "node:child_process";
import type { LineEdit } from "#/scripts/pull-request-text.ts";

export type GitCommit = {
  sha: string;
  subject: string;
  parents: string[];
  files: string[];
  skillEdits: readonly LineEdit[];
};

const nulByte = "\0";
const noFiles = () => false;

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

function changedLinesOf(sha: string, file: string): LineEdit {
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
  ]);
  const body = patch
    .split("\n")
    .filter((line) => !line.startsWith("---") && !line.startsWith("+++"));
  return {
    file,
    removed: body.filter((line) => line.startsWith("-")).map((line) => line.slice(1)),
    added: body.filter((line) => line.startsWith("+")).map((line) => line.slice(1)),
  };
}

export function commitsBetween(
  base: string,
  head: string,
  linesOf: (file: string) => boolean = noFiles,
): GitCommit[] {
  return git(["rev-list", `${base}..${head}`])
    .split("\n")
    .filter((sha) => sha.length > 0)
    .map((sha) => {
      const [subject = "", parentList = ""] = git(["log", "-1", "--format=%s%n%P", sha]).split(
        "\n",
      );
      const parents = parentList.split(" ").filter((parent) => parent.length > 0);
      const merge = parents.length > 1;
      const files = filesOf(
        git([
          "diff-tree",
          ...(merge ? ["--cc"] : ["-r", "--root"]),
          "--no-commit-id",
          "--name-only",
          "--no-renames",
          "-z",
          sha,
        ]),
      );
      const skillEdits = merge
        ? []
        : files.filter(linesOf).map((file) => changedLinesOf(sha, file));
      return { sha, subject, parents, files, skillEdits };
    });
}
