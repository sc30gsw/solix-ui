import { spawnSync } from "node:child_process";
import {
  emptyChangesetProblems,
  fallowEnv,
  fallowJson,
  installedFallow,
} from "#/scripts/fallow-audit.ts";
import { git, gitRun, pathsIn } from "#/scripts/git.ts";

const usage = "usage: check-fallow-audit.ts [<base revision>, origin/main when left out]";

const [base = "origin/main", ...extra] = process.argv.slice(2);
if (extra.length > 0 || base.startsWith("-")) {
  console.error(usage);
  process.exit(2);
}

const dirty = [
  ...pathsIn(git(["diff", "--name-only", "-z"])).map((path) => `  unstaged change: ${path}`),
  ...pathsIn(git(["diff", "--cached", "--name-only", "-z"])).map(
    (path) => `  staged change: ${path}`,
  ),
  ...pathsIn(git(["ls-files", "--others", "--exclude-standard", "-z"])).map(
    (path) => `  untracked file: ${path}`,
  ),
];
if (dirty.length > 0) {
  console.error(
    [
      "fallow audits the working tree, and the audit must hold for HEAD, so nothing may be uncommitted.",
      ...dirty,
      "Commit or discard each one, then audit again.",
    ].join("\n"),
  );
  process.exit(1);
}

const resolvedBase = gitRun(["rev-parse", "--verify", "--quiet", `${base}^{commit}`]);
if (resolvedBase.status !== 0) {
  console.error(
    `git finds no commit for ${base}: ${resolvedBase.stderr.trim() || "unknown revision"}. Fetch ${base}, or give the base revision as the argument.`,
  );
  process.exit(2);
}

const mergeBase = gitRun(["merge-base", resolvedBase.stdout.trim(), "HEAD"]);
if (mergeBase.status !== 0) {
  console.error(
    `git finds no merge-base of ${base} and HEAD: ${mergeBase.stderr.trim() || "they share no commit"}. Fetch ${base}, or give the base revision as the argument.`,
  );
  process.exit(2);
}
const from = mergeBase.stdout.trim();
const changed = pathsIn(git(["diff", "--name-only", "--no-renames", "-z", `${from}..HEAD`]));

let audited: number | undefined;
try {
  const report = fallowJson(["audit", "--base", from]);
  const count =
    typeof report === "object" && report !== null
      ? Reflect.get(report, "changed_files_count")
      : undefined;
  audited = typeof count === "number" ? count : undefined;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
if (audited === undefined) {
  console.error("fallow audit --format json gave no numeric changed_files_count.");
  process.exit(2);
}
const problems = emptyChangesetProblems(audited, changed);
if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}

const audit = spawnSync(installedFallow, ["audit", "--base", from], {
  stdio: "inherit",
  env: fallowEnv,
});
process.exit(audit.status ?? 1);
