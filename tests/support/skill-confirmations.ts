import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const confirmedCommit = /Last confirmed against commit `([0-9a-f]{7,40})`/;
const words = /\S+/g;

export const mergedCommitsVariable = "SOLIX_MERGED_COMMITS";

export function mergedCommitsIn(environment: NodeJS.ProcessEnv): string[] {
  return environment[mergedCommitsVariable]?.match(words) ?? [];
}

function gitStatus(directory: string, args: readonly string[]): number | null {
  return spawnSync("git", args, { cwd: directory, stdio: "ignore" }).status;
}

export function ancestryOf(
  commit: string,
  directory: string,
  mergedCommits: readonly string[],
): "ancestor" | "not an ancestor" | "unknown" {
  const merging = gitStatus(directory, ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"]) === 0;
  const heads = ["HEAD", ...(merging ? ["MERGE_HEAD"] : []), ...mergedCommits];
  const statuses = heads.map((head) =>
    gitStatus(directory, ["merge-base", "--is-ancestor", commit, head]),
  );
  if (statuses.includes(0)) return "ancestor";
  return statuses.every((status) => status === 1) ? "not an ancestor" : "unknown";
}

export function unconfirmedSkills(
  directory: string,
  skillNames: readonly string[],
  mergedCommits: readonly string[],
): string[] {
  return skillNames
    .filter((name) => name.startsWith("verify-"))
    .flatMap((name) => {
      const file = join(directory, ".agents/skills", name, "SKILL.md");
      const text = existsSync(file) ? readFileSync(file, "utf8") : "";
      const commit = confirmedCommit.exec(text)?.[1];
      if (commit === undefined) return [];
      const ancestry = ancestryOf(commit, directory, mergedCommits);
      if (ancestry === "ancestor") return [];
      return [
        ancestry === "unknown"
          ? `.agents/skills/${name}/SKILL.md: it was last confirmed against ${commit}, which this clone does not hold. Name a commit of this branch.`
          : `.agents/skills/${name}/SKILL.md: it was last confirmed against ${commit}, which neither HEAD nor, during a merge, the merged commit contains. Confirm the skill against a commit of this branch and name that one.`,
      ];
    });
}
