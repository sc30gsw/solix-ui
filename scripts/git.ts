import { spawnSync } from "node:child_process";

export type GitCommit = { sha: string; subject: string; parents: string[]; files: string[] };
export type ChangedLines = { removed: readonly string[]; added: readonly string[] };

const nulByte = "\0";
const signaturesHidden = ["-c", "log.showSignature=false"];

export function gitRun(args: readonly string[]): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const run = spawnSync("git", [...signaturesHidden, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

export function git(args: readonly string[]): string {
  const run = gitRun(args);
  if (run.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed with status ${run.status}:\n${run.stderr.trim()}`,
    );
  }
  return run.stdout;
}

export function pathsIn(output: string): string[] {
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

function viewOf(parents: readonly string[]): string[] {
  if (parents.length > 2) return ["diff-tree", "--cc", "-r", "--no-commit-id"];
  if (parents.length === 2) return ["show", "--remerge-diff", "--format="];
  return ["diff-tree", "-r", "--root", "--no-commit-id"];
}

function filesOf(sha: string, parents: readonly string[]): string[] {
  return pathsIn(git([...viewOf(parents), "--name-only", "--no-renames", "-z", sha]));
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
      return { sha, subject, parents, files: filesOf(sha, parents) };
    });
}
