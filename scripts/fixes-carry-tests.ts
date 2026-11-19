export type Commit = { sha: string; subject: string; files: string[] };

const fixType = /^fix(\([^()]*\))?!?:/;
const testFile = /\.(test|stories)\.[cm]?[jt]sx?$/;
const underTests = /(^|\/)tests\//;
const verificationScript = /^\.agents\/skills\/verify-[^/]+\/scripts\//;

export function isTestFile(path: string): boolean {
  return testFile.test(path) || underTests.test(path) || verificationScript.test(path);
}

export function fixesWithoutATest(commits: readonly Commit[]): string[] {
  return commits
    .filter(({ subject, files }) => fixType.test(subject) && !files.some(isTestFile))
    .map(
      ({ sha, subject }) =>
        `${sha.slice(0, 7)} "${subject}" is a fix that changes no test file. Add the test that fails before the fix to the same commit.`,
    );
}
