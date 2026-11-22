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
const withoutTheUsersConfig = { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };

export function gitInScratchRepository(
  root: string,
  args: readonly string[],
  expectedStatus = 0,
): string {
  const result = spawnSync("git", [...scratchSettings, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...withoutTheUsersConfig },
  });
  if (result.status !== expectedStatus) {
    const said = [result.stderr, result.stdout]
      .map((output) => output?.trim() ?? "")
      .filter((output) => output !== "");
    throw new Error(
      `git ${args.join(" ")} in ${root} ended with status ${result.status}${result.signal === null ? "" : ` and signal ${result.signal}`}, not ${expectedStatus}: ${said.join("\n") || String(result.error ?? "it printed nothing")}`,
    );
  }
  return result.stdout;
}
