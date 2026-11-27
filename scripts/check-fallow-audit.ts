import { auditFallow, emptyChangesetProblems, printFallowAudit } from "#/scripts/fallow-audit.ts";
import { git, gitRun, pathsIn } from "#/scripts/git.ts";

const usage = "usage: check-fallow-audit.ts [<base revision>, origin/main when left out]";

function gitIn(root: string, args: readonly string[]): string {
  return git(["-C", root, ...args]);
}

function uncommittedChangesIn(root: string): string[] {
  return [
    ...pathsIn(gitIn(root, ["diff", "--name-only", "-z"])).map(
      (path) => `  unstaged change: ${path}`,
    ),
    ...pathsIn(gitIn(root, ["diff", "--cached", "--name-only", "-z"])).map(
      (path) => `  staged change: ${path}`,
    ),
    ...pathsIn(gitIn(root, ["ls-files", "--others", "--exclude-standard", "-z"])).map(
      (path) => `  untracked file: ${path}`,
    ),
  ];
}

function resolveMergeBase(root: string, base: string): string {
  const resolvedBase = gitRun(["-C", root, "rev-parse", "--verify", "--quiet", `${base}^{commit}`]);
  if (resolvedBase.status !== 0) {
    throw new Error(
      `git finds no commit for ${base}: ${resolvedBase.stderr.trim() || "unknown revision"}. Fetch ${base}, or give the base revision as the argument.`,
    );
  }
  const mergeBase = gitRun(["-C", root, "merge-base", resolvedBase.stdout.trim(), "HEAD"]);
  if (mergeBase.status !== 0) {
    throw new Error(
      `git finds no merge-base of ${base} and HEAD: ${mergeBase.stderr.trim() || "they share no commit"}. Fetch ${base}, or give the base revision as the argument.`,
    );
  }
  return mergeBase.stdout.trim();
}

function runAudit(args: readonly string[]): number {
  const [base = "origin/main", ...extra] = args;
  if (extra.length > 0 || base === "" || base.startsWith("-")) {
    console.error(usage);
    return 2;
  }
  const root = git(["rev-parse", "--show-toplevel"]).trim();
  const dirty = uncommittedChangesIn(root);
  if (dirty.length > 0) {
    console.error(
      [
        "fallow audits the working tree, and the audit must hold for HEAD, so nothing may be uncommitted.",
        ...dirty,
        "Commit or discard each one, then audit again.",
      ].join("\n"),
    );
    return 1;
  }
  const from = resolveMergeBase(root, base);
  const changed = pathsIn(
    gitIn(root, ["diff", "--name-only", "--no-renames", "-z", `${from}..HEAD`, "--"]),
  );
  const result = auditFallow(from, root);
  const problems = emptyChangesetProblems(result.changedFilesCount, changed);
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    return 1;
  }
  if (result.verdict === "pass" && result.status === 0) {
    console.log(
      `fallow audit: pass (${result.changedFilesCount} changed ${result.changedFilesCount === 1 ? "file" : "files"} vs ${from.slice(0, 7)})`,
    );
    return 0;
  }
  const printStatus = printFallowAudit(from, root);
  if (result.status !== 0) return result.status;
  if (printStatus !== 0) return printStatus;
  return result.verdict === "warn" ? 0 : 1;
}

try {
  process.exit(runAudit(process.argv.slice(2)));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
