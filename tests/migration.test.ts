import { spawnSync } from "node:child_process";
import { existsSync, globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import {
  migrationFile,
  migrationMarkdown,
  migrationProblems,
  type MigrationRow,
  migrationRows,
} from "#/scripts/migration.ts";
import { repositoryRoot } from "#/tests/support/workspace.ts";

const sourceTests = "apps/*/tests/**/*.test.ts";
const listedTest = /^(\S+\.e2e\.ts) › .* \[([\w.-]+)\]$/;

function e2eTestsOfEachFile(): Map<string, Record<string, number>> {
  const listing = spawnSync(join(repositoryRoot, "node_modules/.bin/e2e"), ["list"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, E2E_TELEMETRY_DISABLED: "1" },
  });
  if (listing.status !== 0) throw new Error(`e2e list failed: ${listing.stderr}`);
  const counted = new Map<string, Record<string, number>>();
  for (const line of listing.stdout.split("\n")) {
    const [, file, target] = listedTest.exec(line.trim()) ?? [];
    if (file === undefined || target === undefined) continue;
    const counts = counted.get(file) ?? {};
    counts[target] = (counts[target] ?? 0) + 1;
    counted.set(file, counts);
  }
  return counted;
}

const fixtureSource = 'test("kept", () => {});\ntest("moved", () => {});\n';
const fixtureFacts = {
  sourceFiles: ["apps/a/tests/a.test.ts", "apps/b/tests/b.test.ts"],
  sourceText: (file: string) => (file.startsWith("apps/") ? fixtureSource : undefined),
  e2eTestsOnEachTarget: (file: string) =>
    file === "apps/a/tests/a.e2e.ts" ? { chromium: 2, webkit: 2 } : undefined,
};
const ported: MigrationRow = {
  source: "apps/a/tests/a.test.ts",
  tests: ["gone"],
  status: "ported",
  e2e: "apps/a/tests/a.e2e.ts",
  e2eTestsPerTarget: 2,
  note: "",
};
const fixtureRows: MigrationRow[] = [
  ported,
  { source: "apps/a/tests/a.test.ts", tests: ["kept"], status: "stays", note: "" },
  { source: "apps/b/tests/b.test.ts", status: "todo", note: "" },
];

test("the migration ledger fails a test file with no row, a split file with a row that names no tests, a row for a file that is gone, a status outside the list, a ported test still in its source, an e2e file that does not exist, and an e2e count that is not what e2e list gives", () => {
  expect(migrationProblems(fixtureRows, fixtureFacts)).toEqual([]);
  const problemsWith = (rows: MigrationRow[]) => migrationProblems(rows, fixtureFacts);

  expect(problemsWith(fixtureRows.slice(0, 2))).toEqual([
    "MIGRATION.md: apps/b/tests/b.test.ts has no row. Add one to scripts/migration.ts.",
  ]);
  expect(problemsWith([...fixtureRows.slice(1), { ...ported, tests: undefined }])).toContainEqual(
    expect.stringContaining("has several rows, and one of them names no tests"),
  );
  expect(
    problemsWith([...fixtureRows, { source: "apps/c/tests/c.test.ts", status: "todo", note: "" }]),
  ).toContainEqual(expect.stringContaining("names a test file that does not exist"));
  expect(
    problemsWith([
      ...fixtureRows.slice(0, 2),
      { source: "apps/b/tests/b.test.ts", status: JSON.parse('"done"'), note: "" },
    ]),
  ).toContainEqual(expect.stringContaining("has a status that is not one of ported, stays, todo"));
  expect(problemsWith([{ ...ported, tests: ["moved"] }, ...fixtureRows.slice(1)])).toContainEqual(
    expect.stringContaining('still finds "moved" in the source'),
  );
  expect(
    problemsWith([{ ...ported, e2e: "apps/a/tests/missing.e2e.ts" }, ...fixtureRows.slice(1)]),
  ).toContainEqual(expect.stringContaining("names no e2e file that exists"));
  expect(problemsWith([{ ...ported, e2eTestsPerTarget: 3 }, ...fixtureRows.slice(1)])).toEqual([
    "MIGRATION.md: the ported row of apps/a/tests/a.test.ts says 3 e2e tests on each target, but e2e list gives 2 on chromium.",
    "MIGRATION.md: the ported row of apps/a/tests/a.test.ts says 3 e2e tests on each target, but e2e list gives 2 on webkit.",
  ]);
});

test("the migration ledger holds every source test file, each ported test only in e2e, and the e2e count on each target that e2e list gives", () => {
  const counted = e2eTestsOfEachFile();
  const problems = migrationProblems(migrationRows, {
    sourceFiles: globSync(sourceTests, { cwd: repositoryRoot }).sort(),
    sourceText: (file) =>
      existsSync(join(repositoryRoot, file))
        ? readFileSync(join(repositoryRoot, file), "utf8")
        : undefined,
    e2eTestsOnEachTarget: (file) => counted.get(file),
  });

  expect(counted.size).toBeGreaterThan(0);
  expect(problems).toEqual([]);
});

test(`${migrationFile} is the table the ledger in scripts/migration.ts generates, so the file and the ledger never disagree; node scripts/write-migration.ts writes it`, () => {
  expect(readFileSync(join(repositoryRoot, migrationFile), "utf8")).toBe(migrationMarkdown());
});
