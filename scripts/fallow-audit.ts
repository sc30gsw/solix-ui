import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { repositoryRoot } from "#/scripts/repository.ts";

export const installedFallow = join(repositoryRoot, "node_modules/.bin/fallow");
export const fallowEnv = { ...process.env, FALLOW_TELEMETRY_DISABLED: "1" };

export function fallowJson(args: readonly string[], cwd?: string): unknown {
  const run = spawnSync(installedFallow, [...args, "--format", "json", "--quiet"], {
    cwd,
    encoding: "utf8",
    env: fallowEnv,
    maxBuffer: 64 * 1024 * 1024,
  });
  try {
    return JSON.parse(run.stdout);
  } catch {
    const detail =
      (run.stderr ?? "").trim() || (run.stdout ?? "").trim() || String(run.error ?? "no output");
    throw new Error(
      `fallow ${args.join(" ")} --format json failed with status ${run.status}:\n${detail}`,
    );
  }
}

export function emptyChangesetProblems(audited: number, changed: readonly string[]): string[] {
  return audited === 0 && changed.length > 0
    ? [
        `fallow audited no changed file, but git diff names ${changed.length}: ${changed.join(", ")}. The audit would pass without reading the change. Check the base it was given.`,
      ]
    : [];
}
