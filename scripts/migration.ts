export const migrationFile = "MIGRATION.md";
export const migrationStatuses = ["ported", "stays", "todo"] as const;

export type MigrationStatus = (typeof migrationStatuses)[number];

export type MigrationRow = {
  source: string;
  tests?: readonly string[];
  status: MigrationStatus;
  e2e?: string;
  e2eTestsPerTarget?: number;
  note: string;
};

const notPlaywright =
  "Vitest runs it without driving Playwright itself, so it stays outside the migration";
const ownConfig = "Serves another app, so it needs an e2e config of its own";
const scriptsOff =
  "Opens a page with scripts off in some cases, which `web()` cannot; those cases stay";

export const migrationRows: readonly MigrationRow[] = [
  {
    source: "apps/playground/tests/behaviour-seam.test.ts",
    status: "todo",
    note: scriptsOff,
  },
  { source: "apps/playground/tests/box.test.ts", status: "todo", note: scriptsOff },
  { source: "apps/playground/tests/button.test.ts", status: "todo", note: scriptsOff },
  { source: "apps/playground/tests/color-scheme.test.ts", status: "todo", note: scriptsOff },
  { source: "apps/playground/tests/consumer.test.ts", status: "todo", note: "" },
  {
    source: "apps/playground/tests/dev-diagnostics.test.ts",
    status: "todo",
    note: "Wait for the `server-diagnostics` branch, which is changing it and `tests/support/server-process.ts`",
  },
  {
    source: "apps/playground/tests/disclosure.test.ts",
    status: "todo",
    note: `${scriptsOff}. Next: its summary has no role, so a \`{ text }\` target addresses it, as \`apps/playground/tests/targets.e2e.ts\` shows`,
  },
  { source: "apps/playground/tests/layer-order.test.ts", status: "todo", note: "" },
  { source: "apps/playground/tests/layout.test.ts", status: "todo", note: scriptsOff },
  {
    source: "apps/playground/tests/modal-protocol.test.ts",
    status: "todo",
    note: "Generated sequences with fast-check, which have no e2e counterpart yet",
  },
  { source: "apps/playground/tests/modal.test.ts", status: "todo", note: scriptsOff },
  { source: "apps/playground/tests/primitives-hydration.test.ts", status: "todo", note: "" },
  {
    source: "apps/playground/tests/roving-list-model.test.ts",
    status: "stays",
    note: notPlaywright,
  },
  { source: "apps/playground/tests/style-nonce.test.ts", status: "todo", note: scriptsOff },
  {
    source: "apps/playground/tests/tabs-protocol.test.ts",
    status: "todo",
    note: "Generated sequences with fast-check, which have no e2e counterpart yet",
  },
  { source: "apps/playground/tests/tabs.test.ts", status: "todo", note: scriptsOff },
  {
    source: "apps/playground/tests/text-input.test.ts",
    tests: [
      "has the library's border, height, background and text colour",
      "a consumer's plain class beats the library's background, and the height stays the library's",
      "shows the error border only after the user has committed an invalid value",
      "takes the primary border while it has keyboard focus",
      "looks disabled and cannot be typed in when disabled",
    ],
    status: "ported",
    e2e: "apps/playground/tests/text-input.e2e.ts",
    e2eTestsPerTarget: 7,
    note: "The commit test splits into three, one per outcome. Defect check: `:user-invalid` given the border token, both suites fail",
  },
  {
    source: "apps/playground/tests/text-input.test.ts",
    tests: ["a text input has the library's border with scripts turned off"],
    status: "stays",
    note: "`web()` has no `javaScriptEnabled`",
  },
  {
    source: "apps/storybook/tests/accessibility-scan.test.ts",
    status: "stays",
    note: notPlaywright,
  },
  { source: "apps/storybook/tests/broken-stories.test.ts", status: "stays", note: notPlaywright },
  {
    source: "apps/storybook/tests/stories-in-verify.test.ts",
    status: "stays",
    note: notPlaywright,
  },
  {
    source: "apps/storybook/tests/story-controls-watch.test.ts",
    status: "stays",
    note: notPlaywright,
  },
  { source: "apps/storybook/tests/story-controls.test.ts", status: "stays", note: notPlaywright },
  { source: "apps/storybook/tests/story-coverage.test.ts", status: "stays", note: notPlaywright },
  { source: "apps/storybook/tests/story-spec.test.ts", status: "stays", note: notPlaywright },
  { source: "apps/storybook/tests/storybook-interface.test.ts", status: "todo", note: ownConfig },
  { source: "apps/stylex-consumer/tests/stylex-consumer.test.ts", status: "todo", note: ownConfig },
];

export type MigrationFacts = {
  sourceFiles: readonly string[];
  sourceText: (file: string) => string | undefined;
  e2eTestsOnEachTarget: (file: string) => Readonly<Record<string, number>> | undefined;
};

export function migrationProblems(
  rows: readonly MigrationRow[],
  { sourceFiles, sourceText, e2eTestsOnEachTarget }: MigrationFacts,
): string[] {
  const rowsOf = (file: string) => rows.filter(({ source }) => source === file);
  return [
    ...sourceFiles
      .filter((file) => rowsOf(file).length === 0)
      .map((file) => `${migrationFile}: ${file} has no row. Add one to scripts/migration.ts.`),
    ...sourceFiles
      .filter((file) => rowsOf(file).length > 1 && rowsOf(file).some(({ tests }) => !tests))
      .map(
        (file) =>
          `${migrationFile}: ${file} has several rows, and one of them names no tests. Give each row the titles it holds.`,
      ),
    ...rows.flatMap((row) => {
      const where = `${migrationFile}: the ${row.status} row of ${row.source}`;
      const text = sourceText(row.source);
      if (!sourceFiles.includes(row.source) || text === undefined) {
        return [`${where} names a test file that does not exist.`];
      }
      const statusProblems = migrationStatuses.includes(row.status)
        ? []
        : [`${where} has a status that is not one of ${migrationStatuses.join(", ")}.`];
      const titleProblems = (row.tests ?? []).flatMap((title) => {
        const present = text.includes(title);
        if (row.status === "ported" && present) {
          return [
            `${where} still finds "${title}" in the source. A ported test leaves the old runner in the same change.`,
          ];
        }
        return row.status !== "ported" && !present
          ? [`${where} names "${title}", which the source does not hold.`]
          : [];
      });
      if (row.status !== "ported") return [...statusProblems, ...titleProblems];
      const counts = row.e2e === undefined ? undefined : e2eTestsOnEachTarget(row.e2e);
      if (counts === undefined) {
        return [...statusProblems, ...titleProblems, `${where} names no e2e file that exists.`];
      }
      const countProblems = Object.entries(counts)
        .filter(([, count]) => count !== row.e2eTestsPerTarget)
        .map(
          ([target, count]) =>
            `${where} says ${row.e2eTestsPerTarget ?? 0} e2e tests on each target, but e2e list gives ${count} on ${target}.`,
        );
      return [...statusProblems, ...titleProblems, ...countProblems];
    }),
  ];
}

const header = [
  "# Migration to e2e",
  "",
  "This file is generated from `scripts/migration.ts` by `node scripts/write-migration.ts`; edit the ledger there. `tests/migration.test.ts` fails when the ledger and the repository drift.",
  "",
  "Source: Playwright driven directly from Vitest, in `apps/playground/tests`, `apps/stylex-consumer/tests` and `apps/storybook/tests/storybook-interface.test.ts`, with their helpers in `tests/support` (guide: https://e2e.com/docs/migrate/playwright.md, engine: https://e2e.com/docs/web.md)",
  "e2e: `e2e.config.ts`, tests `apps/playground/tests/**/*.e2e.ts`",
  "Start dependencies: none; `vp run test:e2e` builds the packages, and each target's `app.command` starts the built playground with `node dist/server/node.js` on a free port",
  "Run old: `vp test <file>`",
  "Run new: `vp run test:e2e`, or `vp run build:packages` and then `vp run e2e run <file>`",
  "Harness: done, smoke `apps/playground/tests/text-input.e2e.ts` on every engine `enginesToVerify()` gives",
  "Defect check: on",
  "",
  "A ported test leaves the old runner in the same change. The repository allows no code comments, so a ported file does not name its source; this table does.",
  "",
];

const helpers = [
  "## Shared helpers",
  "",
  "| Source | e2e | Used by |",
  "| --- | --- | --- |",
  "| tests/support/global-setup.ts, which starts the playground | `app.command` of each target in `e2e.config.ts` | every e2e test |",
  "| tests/support/served-app.ts `inEveryEngine()` | one target per engine of `enginesToVerify()` in `e2e.config.ts` | every e2e test |",
  "| apps/playground/tests/support/opening.ts `opened()` until `hydrated` | apps/playground/tests/support/e2e-playground.ts `openedHydrated()`, with apps/playground/tests/support/readiness.ts, which both share | every e2e test |",
  "| the console listening of opening.ts and console-check.ts | tests/support/console-recorder.ts, which both runners install, checked after each test by the `hydrated` fixture | every e2e test |",
  "| apps/playground/tests/support/playground.ts `openPage()` and `computed()` | the `expected` and `styleOf` fixtures of e2e-playground.ts, with apps/playground/tests/support/targets.ts | text-input |",
  "| scripts/expected-values.ts `expectedValues()` | the same function, given each runner's reader | text-input |",
  "| tests/support/server-process.ts | not ported: the `server-diagnostics` branch is changing it, and `app.command` takes its place | |",
  "",
];

const gaps = [
  "## Gaps",
  "",
  "- `web()` takes no `javaScriptEnabled`, and the guide does not list it, so every test that opens a page with scripts off stays in the old runner.",
  "- `page.on('console')` and `page.on('pageerror')` are \"Planned\" in the guide. An init script records `console.error`, `console.warn`, uncaught errors, unhandled rejections, resources that fail to load and refusals of the page's content security policy, in both runners. A message the browser itself logs for any other reason reaches only the old runner.",
  '- `locator.evaluate()` is "Planned". A computed style is read in the page from the element a target\'s role and accessible name give, the same element `screen.getByRole` finds, as `apps/playground/tests/targets.e2e.ts` holds.',
  "- e2e saves a screenshot of every failed test under `.e2e/results/<test>/attempt-<n>/screenshots`, and no option turns it off. `.e2e` is ignored by git, and no workflow uploads it.",
  "- When a test fails, e2e's capture of the failed screen adds a stylesheet that the playground's policy refuses, so the trace's App log shows `Refused to apply a stylesheet` at the failing step. It is e2e's, not the app's.",
  "- e2e sends anonymous telemetry unless `E2E_TELEMETRY_DISABLED=1` is set, which the root `e2e` script does: run it as `vp run e2e <command>`.",
  "- color-scheme's storage-event test opens a second page in the same context. `browser.newTab()` covers that; it has not been tried yet.",
  "- Generated sequences with fast-check (tabs-protocol, modal-protocol) have no e2e counterpart and have not been tried.",
  "",
  "## Next",
  "",
  "apps/playground/tests/disclosure.test.ts, whose helpers are all ported.",
];

function cell(text: string): string {
  return text === "" ? "-" : text.replaceAll("|", "\\|");
}

export function migrationMarkdown(rows: readonly MigrationRow[] = migrationRows): string {
  const total = (status: MigrationStatus) => rows.filter((row) => row.status === status).length;
  const table = [
    "| Source | Tests | Status | e2e | e2e tests on each target | Notes |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows
      .map((row) =>
        [
          row.source,
          row.tests?.map((title) => `"${title}"`).join("; ") ?? "all",
          row.status,
          row.e2e ?? "",
          row.e2eTestsPerTarget === undefined ? "" : String(row.e2eTestsPerTarget),
          row.note,
        ]
          .map(cell)
          .join(" | "),
      )
      .map((line) => `| ${line} |`),
    "",
    `${rows.length} rows: ${migrationStatuses.map((status) => `${total(status)} ${status}`).join(", ")}.`,
    "",
  ];
  return [...header, ...table, ...helpers, ...gaps, ""].join("\n");
}
