import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { commitsBeingMerged } from "#/scripts/merged-commits.ts";

export const confirmedCommit = /Last confirmed against commit `([0-9a-f]{7,40})`/;

function gitStatus(directory: string, args: readonly string[]): number | null {
  return spawnSync("git", args, { cwd: directory, stdio: "ignore" }).status;
}

/**
 * Whether `commit` is in the history of HEAD or, while a merge is being committed, of a commit it
 * merges, as `commitsBeingMerged` finds them, or "unknown" when the clone does not hold it.
 */
export function ancestryOf(
  commit: string,
  directory: string,
  environment: NodeJS.ProcessEnv,
): "ancestor" | "not an ancestor" | "unknown" {
  const statuses = ["HEAD", ...commitsBeingMerged(directory, environment)].map((head) =>
    gitStatus(directory, ["merge-base", "--is-ancestor", commit, head]),
  );
  if (statuses.includes(0)) return "ancestor";
  return statuses.every((status) => status === 1) ? "not an ancestor" : "unknown";
}

/**
 * A problem for each of the named skills under `.agents/skills` in `directory` that was last
 * confirmed against a commit that neither HEAD nor, during a merge, a merged commit contains.
 */
export function unconfirmedSkills(
  directory: string,
  names: readonly string[],
  environment: NodeJS.ProcessEnv,
): string[] {
  return names.flatMap((name) => {
    const file = join(directory, ".agents/skills", name, "SKILL.md");
    const commit = confirmedCommit.exec(existsSync(file) ? readFileSync(file, "utf8") : "")?.[1];
    if (commit === undefined) return [];
    const ancestry = ancestryOf(commit, directory, environment);
    if (ancestry === "ancestor") return [];
    return [
      ancestry === "unknown"
        ? `.agents/skills/${name}/SKILL.md: it was last confirmed against ${commit}, which this clone does not hold. Name a commit of this branch.`
        : `.agents/skills/${name}/SKILL.md: it was last confirmed against ${commit}, which neither HEAD nor, during a merge, the merged commit contains. Confirm the skill against a commit of this branch and name that one.`,
    ];
  });
}
