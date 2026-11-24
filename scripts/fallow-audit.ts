import { spawnSync } from "node:child_process";
import { join, relative, resolve } from "node:path";
import { repositoryRoot } from "#/scripts/repository.ts";

const installedFallow = join(repositoryRoot, "node_modules/.bin/fallow");
const maxBuffer = 64 * 1024 * 1024;

type AuditResult = {
  readonly status: number;
  readonly changedFilesCount: number;
  readonly verdict: string;
};

function fallowEnv(): NodeJS.ProcessEnv {
  return { ...process.env, FALLOW_TELEMETRY_DISABLED: "1" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function spawnFallow(args: readonly string[], cwd?: string) {
  const run = spawnSync(installedFallow, args, {
    cwd,
    encoding: "utf8",
    env: fallowEnv(),
    maxBuffer,
  });
  if (run.error !== undefined) {
    throw new Error(`fallow ${args.join(" ")} could not start: ${run.error.message}`);
  }
  if (run.signal !== null) {
    throw new Error(`fallow ${args.join(" ")} stopped on signal ${run.signal}.`);
  }
  return run;
}

function fallowJson(args: readonly string[], cwd?: string): { status: number; data: unknown } {
  const run = spawnFallow([...args, "--format", "json", "--quiet"], cwd);
  try {
    return { status: run.status ?? 1, data: JSON.parse(run.stdout) };
  } catch {
    const detail = run.stderr.trim() || run.stdout.trim() || "no output";
    throw new Error(
      `fallow ${args.join(" ")} --format json failed with status ${run.status}:\n${detail}`,
    );
  }
}

export function auditFallow(base: string, cwd?: string): AuditResult {
  const { status, data } = fallowJson(["audit", "--base", base], cwd);
  const changedFilesCount = isRecord(data) ? data.changed_files_count : undefined;
  const verdict = isRecord(data) ? data.verdict : undefined;
  if (typeof changedFilesCount !== "number") {
    throw new Error("fallow audit --format json gave no numeric changed_files_count.");
  }
  if (typeof verdict !== "string") {
    throw new Error("fallow audit --format json gave no string verdict.");
  }
  return { status, changedFilesCount, verdict };
}

export function printFallowAudit(base: string, cwd?: string): void {
  const run = spawnSync(installedFallow, ["audit", "--base", base], {
    cwd,
    stdio: "inherit",
    env: fallowEnv(),
  });
  if (run.error !== undefined) {
    throw new Error(`fallow audit could not start: ${run.error.message}`);
  }
  if (run.signal !== null) {
    throw new Error(`fallow audit stopped on signal ${run.signal}.`);
  }
}

export function unusedFilesIn(cwd: string): string[] {
  const { data } = fallowJson(["dead-code"], cwd);
  const items = isRecord(data) ? data.unused_files : undefined;
  if (!Array.isArray(items)) {
    throw new Error("fallow dead-code --format json returned no unused_files array.");
  }
  return items.map((entry: unknown) => {
    const path = isRecord(entry) ? entry.path : undefined;
    if (typeof path !== "string") {
      throw new Error(
        "fallow dead-code --format json returned an unused_files entry without path.",
      );
    }
    return relative(cwd, resolve(cwd, path));
  });
}

export function emptyChangesetProblems(audited: number, changed: readonly string[]): string[] {
  return audited === 0 && changed.length > 0
    ? [
        `fallow audited no changed file, but git diff names ${changed.length}: ${changed.join(", ")}. The audit would pass without reading the change. Check the base it was given.`,
      ]
    : [];
}
