import { spawnSync } from "node:child_process";

const scratchSettings = [
  "-c",
  "user.name=Test",
  "-c",
  "user.email=test@example.com",
  "-c",
  "core.hooksPath=/dev/null",
  "-c",
  "commit.gpgsign=false",
];

export function gitInScratchRepository(root: string, args: readonly string[]): string {
  const result = spawnSync("git", [...scratchSettings, ...args], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} in ${root}: ${result.stderr || result.error}`);
  }
  return result.stdout;
}
