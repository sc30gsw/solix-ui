export const packagesBuiltFirst = [
  "tests/support/git-free-environment.ts",
  "tests/support/build-packages.ts",
];

export const nodeTestFiles = [
  "tests/**/*.test.{ts,tsx}",
  "packages/*/tests/**/*.test.{ts,tsx}",
  "apps/*/tests/**/*.test.{ts,tsx}",
] as const;
