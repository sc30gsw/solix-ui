import { execFileSync } from "node:child_process";

const nulByte = "\0";

function pathsFrom(args: readonly string[]): string[] {
  return execFileSync("git", args, { encoding: "utf8" })
    .split(nulByte)
    .filter((path) => path.length > 0);
}

const unstaged = pathsFrom(["diff", "--name-only", "-z"]);
const untracked = pathsFrom(["ls-files", "--others", "--exclude-standard", "-z"]);

if (unstaged.length + untracked.length > 0) {
  console.error(
    [
      "The commit holds what the index holds, and verify checks the working tree, so the two must be the same.",
      ...unstaged.map((path) => `  unstaged change: ${path}`),
      ...untracked.map((path) => `  untracked file: ${path}`),
      "Stage each one with git add, or undo it, then commit again. Never git stash: the stash is shared by every worktree.",
    ].join("\n"),
  );
  process.exit(1);
}
