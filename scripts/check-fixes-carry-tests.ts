import { execFileSync } from "node:child_process";
import { type Commit, fixesWithoutATest } from "#/scripts/fixes-carry-tests.ts";

const nulByte = "\0";
const usage = "usage: check-fixes-carry-tests.ts <base commit> <head commit>";

function git(args: readonly string[]): string {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function commitsBetween(base: string, head: string): Commit[] {
  return git(["rev-list", "--no-merges", `${base}..${head}`])
    .split("\n")
    .filter((sha) => sha.length > 0)
    .map((sha) => ({
      sha,
      subject: git(["log", "-1", "--format=%s", sha]).trim(),
      files: git(["diff-tree", "--no-commit-id", "--name-only", "-r", "-z", "--root", sha])
        .split(nulByte)
        .filter((path) => path.length > 0),
    }));
}

const [base, head, ...extra] = process.argv.slice(2);
if (base === undefined || head === undefined || extra.length > 0) {
  console.error(usage);
  process.exit(2);
}
const problems = fixesWithoutATest(commitsBetween(base, head));
for (const problem of problems) console.error(problem);
process.exit(problems.length === 0 ? 0 : 1);
