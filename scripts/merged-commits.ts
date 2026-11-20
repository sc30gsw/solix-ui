import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const words = /\S+/g;
const markedForMerge = /^([0-9a-f]{40,64})\t\t/;

function commitOf(name: string): string[] {
  const resolved = spawnSync(
    "git",
    ["rev-parse", "--verify", "--quiet", "--end-of-options", `${name}^{commit}`],
    { encoding: "utf8" },
  );
  return resolved.status === 0 ? [resolved.stdout.trim()] : [];
}

function fetchedForMerge(): string[] {
  const file = execFileSync("git", ["rev-parse", "--git-path", "FETCH_HEAD"], {
    encoding: "utf8",
  }).trim();
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .flatMap((line) => markedForMerge.exec(line)?.[1] ?? []);
}

const [command = "", ...names] = process.env.GIT_REFLOG_ACTION?.match(words) ?? [];
const merged =
  command === "merge" ? names.flatMap(commitOf) : command === "pull" ? fetchedForMerge() : [];

console.log([...new Set(merged)].join(" "));
