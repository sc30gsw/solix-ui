import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The variable through which `.vite-hooks/pre-merge-commit` tells verify which commits the merge
 * merges. Git runs that hook before it writes `MERGE_HEAD`, and writes it only when the hook fails
 * or the merge stops, so verify cannot read them from `MERGE_HEAD` there.
 */
export const mergedCommitsVariable = "SOLIX_MERGED_COMMITS";

const lineBreak = /\r?\n/;
const whitespace = /\s+/;
const fullHash = /^[0-9a-f]{40,64}$/;

function git(directory: string, args: readonly string[]): { status: number | null; out: string } {
  const result = spawnSync("git", args, { cwd: directory, encoding: "utf8" });
  return { status: result.status, out: result.status === 0 ? result.stdout.trim() : "" };
}

function gitFile(directory: string, name: string): string {
  const path = resolve(directory, git(directory, ["rev-parse", "--git-path", name]).out);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function commitOf(directory: string, name: string): string[] {
  const { status, out } = git(directory, [
    "rev-parse",
    "--verify",
    "--quiet",
    "--end-of-options",
    `${name}^{commit}`,
  ]);
  return status === 0 && fullHash.test(out) ? [out] : [];
}

function fetchedForMerge(directory: string): string[] {
  return gitFile(directory, "FETCH_HEAD")
    .split(lineBreak)
    .map((line) => line.split("\t"))
    .filter(([hash, marker]) => hash !== undefined && fullHash.test(hash) && marker === "")
    .map(([hash]) => hash ?? "");
}

/**
 * The commits that the `git merge` or `git pull` running the hook merges, read from what git gives
 * a hook before it writes `MERGE_HEAD`: `GIT_REFLOG_ACTION`, `merge` and the names it merges, or
 * `pull` and its arguments, whose merge takes the heads in `FETCH_HEAD` not marked `not-for-merge`.
 * A name that does not resolve to a commit, and an action that is neither, give none.
 */
export function commitsTheRunningMergeMerges(
  directory: string,
  environment: NodeJS.ProcessEnv,
): string[] {
  const [action, ...names] = (environment.GIT_REFLOG_ACTION ?? "").trim().split(whitespace);
  const commits =
    action === "pull"
      ? fetchedForMerge(directory)
      : action === "merge"
        ? names.flatMap((name) =>
            name === "FETCH_HEAD" ? fetchedForMerge(directory) : commitOf(directory, name),
          )
        : [];
  return [...new Set(commits)];
}

/**
 * The commits that the merge being committed merges: those in `MERGE_HEAD`, when a stopped merge
 * is finished by `git commit`, and those `.vite-hooks/pre-merge-commit` names in
 * `mergedCommitsVariable`, when `git merge` commits it. Outside a merge there are none.
 */
export function commitsBeingMerged(directory: string, environment: NodeJS.ProcessEnv): string[] {
  const named = [
    ...gitFile(directory, "MERGE_HEAD").split(lineBreak),
    ...(environment[mergedCommitsVariable] ?? "").split(whitespace),
  ].filter((hash) => fullHash.test(hash));
  return [...new Set(named)];
}

if (
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  process.stdout.write(commitsTheRunningMergeMerges(process.cwd(), process.env).join(" "));
}
