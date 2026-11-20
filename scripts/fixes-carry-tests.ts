import { matchesGlob } from "node:path";

export type Commit = { sha: string; subject: string; files: string[] };

export const verificationFiles = [
  "**/*.test.{ts,tsx,mjs}",
  "**/*.stories.tsx",
  "**/tests/**",
  "apps/storybook/fixtures/**",
  "packages/*/fixtures/**",
  "scripts/expected-values.ts",
] as const;

const fixType = /^fix(\([^()]*\))?!?:/;

export function isVerificationFile(path: string): boolean {
  return verificationFiles.some((pattern) => matchesGlob(path, pattern));
}

export function fixesWithoutATest(commits: readonly Commit[]): string[] {
  return commits
    .filter(({ subject, files }) => fixType.test(subject) && !files.some(isVerificationFile))
    .map(
      ({ sha, subject }) =>
        `${sha.slice(0, 7)} "${subject}" is a fix that changes no file of verificationFiles in scripts/fixes-carry-tests.ts. Add the test that fails before the fix to the same commit.`,
    );
}
