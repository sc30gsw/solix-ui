import { type SpawnSyncReturns, spawnSync } from "node:child_process";

const gitVariable = /^GIT_/;

export function withoutGitVariables(
  environment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(environment).filter(([name]) => !gitVariable.test(name)),
  );
}

export function git(
  args: readonly string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): SpawnSyncReturns<string> {
  return spawnSync("git", args, {
    cwd: options.cwd,
    env: withoutGitVariables(options.env),
    encoding: "utf8",
  });
}
