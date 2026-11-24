import { auditFallow, emptyChangesetProblems, printFallowAudit } from "#/scripts/fallow-audit.ts";
import { git, gitRun, pathsIn } from "#/scripts/git.ts";

const usage = "usage: check-fallow-audit.ts [<base revision>, origin/main when left out]";

const [base = "origin/main", ...extra] = process.argv.slice(2);
if (extra.length > 0 || base === "" || base.startsWith("-")) {
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

try {
  const result = auditFallow(from);
  const problems = emptyChangesetProblems(result.changedFilesCount, changed);
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    process.exit(1);
  }
  if (result.verdict === "pass" && result.status === 0) {
    console.log(
      `fallow audit: pass (${result.changedFilesCount} changed ${result.changedFilesCount === 1 ? "file" : "files"} vs ${from.slice(0, 7)})`,
    );
    process.exit(0);
  }
  printFallowAudit(from);
  process.exit(result.status);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
