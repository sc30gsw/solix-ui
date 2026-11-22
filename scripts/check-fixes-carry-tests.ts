import { fixesWithoutATest } from "#/scripts/fixes-carry-tests.ts";
import { commitsBetween } from "#/scripts/git.ts";

const usage = "usage: check-fixes-carry-tests.ts <base commit> <head commit>";

const [base, head, ...extra] = process.argv.slice(2);
if (base === undefined || head === undefined || extra.length > 0) {
  console.error(usage);
  process.exit(2);
}
const problems = fixesWithoutATest(
  commitsBetween(base, head).filter(({ parents }) => parents.length < 2),
);
for (const problem of problems) console.error(problem);
process.exit(problems.length === 0 ? 0 : 1);
