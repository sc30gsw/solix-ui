import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { git, gitRun, pathsIn } from "#/scripts/git.ts";
import { emptyChangesetProblems } from "#/scripts/fallow-audit.ts";
import { repositoryRoot } from "#/scripts/repository.ts";

const usage = "usage: check-fallow-audit.ts [<base revision>, origin/main when left out]";
const fallow = join(repositoryRoot, "node_modules/.bin/fallow");
const workingTreeCheck = join(repositoryRoot, "scripts/check-working-tree.ts");
const withoutTelemetry = { ...process.env, FALLOW_TELEMETRY_DISABLED: "1" };

const [base = "origin/main", ...extra] = process.argv.slice(2);
if (extra.length > 0) {
  console.error(usage);
  process.exit(2);
}

if (spawnSync(process.execPath, [workingTreeCheck], { stdio: "inherit" }).status !== 0) {
  process.exit(1);
}
const staged = pathsIn(git(["diff", "--cached", "--name-only", "-z"]));
if (staged.length > 0) {
  console.error(
    [
      "fallow audits the working tree, and the audit must hold for HEAD, so nothing may be staged.",
      ...staged.map((path) => `  staged change: ${path}`),
      "Commit each one, or unstage it, then audit again.",
    ].join("\n"),
  );
  process.exit(1);
}

const mergeBase = gitRun(["merge-base", base, "HEAD"]);
if (mergeBase.status !== 0) {
  console.error(
    `git finds no merge-base of ${base} and HEAD: ${mergeBase.stderr.trim() || "they share no commit"}. Fetch ${base}, or give the base revision as the argument.`,
  );
  process.exit(2);
}
const from = mergeBase.stdout.trim();
const changed = pathsIn(git(["diff", "--name-only", "--no-renames", "-z", `${from}...HEAD`]));

const measured = spawnSync(fallow, ["audit", "--base", from, "--format", "json", "--quiet"], {
  encoding: "utf8",
  env: withoutTelemetry,
  maxBuffer: 64 * 1024 * 1024,
});
let audited: number | undefined;
try {
  const report: unknown = JSON.parse(measured.stdout);
  const count =
    typeof report === "object" && report !== null
      ? Reflect.get(report, "changed_files_count")
      : undefined;
  audited = typeof count === "number" ? count : undefined;
} catch {
  audited = undefined;
}
if (audited === undefined) {
  console.error(
    `fallow audit --format json gave no changed_files_count, with status ${measured.status}:\n${(measured.stderr ?? "").trim() || (measured.stdout ?? "").trim() || String(measured.error ?? "")}`,
  );
  process.exit(2);
}
const problems = emptyChangesetProblems(audited, changed);
if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}

const audit = spawnSync(fallow, ["audit", "--base", from], {
  stdio: "inherit",
  env: withoutTelemetry,
});
process.exit(audit.status ?? 1);
