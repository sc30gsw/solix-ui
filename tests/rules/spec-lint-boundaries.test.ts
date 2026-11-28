import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, expect, test } from "vite-plus/test";
import { installedVp, repositoryRoot } from "#/scripts/repository.ts";
import config from "#/vite.config.ts";

type Planted = {
  readonly name: string;
  readonly from: string;
  readonly types?: true;
  readonly pins: string;
  readonly refused: boolean;
};

type Boundary = { readonly boundary: string; readonly plants: readonly Planted[] };

const restrictedImport = "no-restricted-imports";
const probeDirectory = "tests/lint-probes";
const theProgramOpener = "packages/core/tests/built-library.ts";
const rootRule = "root";
const programs = "a program opened outside the modules that may";
const theRunner = "the spec runner";
const theComparison = "the runner's comparison";
const aBrowserModule = "a browser module";
const aSourceValue = "a value of packages/core/src";
const aSourceType = "a type of packages/core/src";

function openProgramPlants(refused: boolean): Planted[] {
  return [
    { name: "openProgram", from: "#/scripts/syntax.ts", pins: programs, refused },
    { name: "openProgram", from: "../../scripts/syntax.ts", pins: programs, refused },
  ];
}

const runnersPlant: Planted = {
  name: "assert",
  from: "fast-check",
  pins: "a fast-check runner taken outside the wrapper",
  refused: true,
};

const sourcePlants: Planted[] = [
  { name: "Button", from: "#/src/Button.tsx", pins: aSourceValue, refused: true },
  { name: "Button", from: "../src/Button.tsx", pins: aSourceValue, refused: true },
  { name: "Button", from: "../../src/Button.tsx", pins: aSourceValue, refused: true },
  {
    name: "ButtonProps",
    from: "../src/Button.tsx",
    types: true,
    pins: aSourceType,
    refused: false,
  },
];

const boundaries: readonly Boundary[] = [
  { boundary: rootRule, plants: [runnersPlant, ...openProgramPlants(true)] },
  {
    boundary: "packages-core",
    plants: [
      runnersPlant,
      ...openProgramPlants(true),
      { name: "mount", from: "#/spec/runner.ts", pins: theRunner, refused: true },
      { name: "mount", from: "../spec/runner.ts", pins: theRunner, refused: true },
    ],
  },
  {
    boundary: "spec-document",
    plants: [
      ...openProgramPlants(true),
      {
        name: "fixture",
        from: "#/spec/fixtures.ts",
        pins: "a module a document may import",
        refused: false,
      },
      {
        name: "fixture",
        from: "../spec/fixtures.ts",
        pins: "that module in the other spelling",
        refused: true,
      },
      {
        name: "expect",
        from: "vite-plus/test",
        pins: "a name a document may take from the runner",
        refused: false,
      },
      {
        name: "describe",
        from: "vite-plus/test",
        pins: "a name no document may take from the runner",
        refused: true,
      },
      { name: "mount", from: "#/spec/runner.ts", pins: theRunner, refused: true },
      { name: "mount", from: "../spec/runner.ts", pins: theRunner, refused: true },
    ],
  },
  {
    boundary: "spec-node-module",
    plants: [
      runnersPlant,
      ...openProgramPlants(true),
      { name: "mount", from: "#/spec/runner.ts", pins: theRunner, refused: true },
      { name: "mount", from: "../spec/runner.ts", pins: theRunner, refused: true },
      { name: "sameColour", from: "#/spec/computed.ts", pins: theComparison, refused: true },
      { name: "sameColour", from: "../spec/computed.ts", pins: theComparison, refused: true },
      { name: "specCommands", from: "#/spec/commands.ts", pins: aBrowserModule, refused: true },
      { name: "specCommands", from: "../spec/commands.ts", pins: aBrowserModule, refused: true },
      ...sourcePlants,
    ],
  },
  {
    boundary: "spec-runner-module",
    plants: [runnersPlant, ...openProgramPlants(true), ...sourcePlants],
  },
  {
    boundary: "spec-runner-importer",
    plants: [
      runnersPlant,
      ...openProgramPlants(true),
      { name: "mount", from: "../spec/runner.ts", pins: theRunner, refused: false },
    ],
  },
  { boundary: "program-opener", plants: [runnersPlant, ...openProgramPlants(false)] },
];

type Override = { files?: string | readonly string[]; rules?: Record<string, unknown> };
type Options = { paths?: unknown[]; patterns?: unknown[] };

function filesOf(override: Override): string[] {
  return [override.files ?? []].flat();
}

function optionsOf(rule: unknown): Options | undefined {
  const [, options]: unknown[] = Array.isArray(rule) ? rule : [];
  return typeof options === "object" && options !== null ? (options as Options) : undefined;
}

const overrides = (config.lint?.overrides ?? []) as Override[];
const restricting = overrides.filter(
  ({ rules }) => optionsOf(rules?.[restrictedImport]) !== undefined,
);
const rootOptions = optionsOf(config.lint?.rules?.[restrictedImport]);

function probesOf(override: Override): string[] {
  return filesOf(override).filter((file) => file.startsWith(`${probeDirectory}/`));
}

function probeFile(boundary: string): string {
  const named = restricting.flatMap(probesOf).find((file) => file.endsWith(`/${boundary}.ts`));
  return named ?? `${probeDirectory}/${boundary}.ts`;
}

function sourceOf(plants: readonly Planted[]): string {
  return `${plants
    .map(
      ({ name, from, types }, index) =>
        `import ${types === true ? "type " : ""}{ ${name} as probe${index} } from "${from}";`,
    )
    .join("\n")}\n`;
}

const planted = boundaries.map(({ boundary, plants }) => ({
  boundary,
  file: probeFile(boundary),
  cases: plants.map((plant, index) => ({ ...plant, line: index + 1 })),
}));

mkdirSync(join(repositoryRoot, probeDirectory), { recursive: true });
for (const { file, cases } of planted) {
  writeFileSync(join(repositoryRoot, file), sourceOf(cases));
}
afterAll(() => {
  rmSync(join(repositoryRoot, probeDirectory), { recursive: true, force: true });
});

type Diagnostic = {
  readonly code: string;
  readonly help?: string;
  readonly filename: string;
  readonly labels?: readonly { readonly span: { readonly line: number } }[];
};

function reportOn(files: readonly string[]): Diagnostic[] {
  const run = spawnSync(installedVp, ["lint", "-f", "json", ...files], {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const printed = run.stdout ?? "";
  let read: { diagnostics?: Diagnostic[] };
  try {
    read = JSON.parse(printed) as { diagnostics?: Diagnostic[] };
  } catch {
    throw new Error(`vp lint printed no readable report: ${printed}${run.stderr ?? ""}`);
  }
  return read.diagnostics ?? [];
}

const reported = reportOn(planted.map(({ file }) => file));

function helpsAt(file: string, line: number): string[] {
  return reported
    .filter((diagnostic) => diagnostic.code === `eslint(${restrictedImport})`)
    .filter(({ filename, labels }) => filename === file && labels?.[0]?.span.line === line)
    .map(({ help }) => help ?? "")
    .sort();
}

test("the lint run read every probe, so a boundary with no diagnostic refused nothing instead of never being read", () => {
  expect(planted.map(({ file }) => file)).toEqual(
    boundaries.map(({ boundary }) => `${probeDirectory}/${boundary}.ts`),
  );
  expect([...new Set(reported.map(({ filename }) => filename))].sort()).toEqual(
    planted.map(({ file }) => file).sort(),
  );
});

test(`every override that restricts imports names one probe under ${probeDirectory}, no two the same, and the root rule's probe is named by none`, () => {
  expect(restricting.length).toBeGreaterThan(1);
  expect(restricting.map((override) => probesOf(override).length)).toEqual(
    restricting.map(() => 1),
  );

  const named = restricting.flatMap(probesOf).sort();
  expect([...new Set(named)]).toEqual(named);
  expect(named).toEqual(
    boundaries
      .filter(({ boundary }) => boundary !== rootRule)
      .map(({ boundary }) => `${probeDirectory}/${boundary}.ts`)
      .sort(),
  );
});

test("no override drops the paths the root rule restricts, and only the program openers' override drops its patterns", () => {
  const rootPaths = rootOptions?.paths ?? [];
  const rootPatterns = rootOptions?.patterns ?? [];

  expect(rootPaths).toHaveLength(1);
  expect(rootPatterns).toHaveLength(1);
  for (const { rules } of restricting) {
    expect(optionsOf(rules?.[restrictedImport])?.paths).toEqual(expect.arrayContaining(rootPaths));
  }
  expect(
    restricting
      .filter(
        ({ rules }) =>
          !(optionsOf(rules?.[restrictedImport])?.patterns ?? []).includes(rootPatterns[0]),
      )
      .map(filesOf),
  ).toEqual([expect.arrayContaining([theProgramOpener])]);
});

const cases = planted.flatMap(({ boundary, file, cases: plants }) =>
  plants.map(({ from, line, pins, refused }) => ({ boundary, file, from, line, pins, refused })),
);

test.each(cases)(
  "in $boundary, $from is $pins and refused is $refused",
  ({ file, line, refused }) => {
    expect(helpsAt(file, line).length > 0).toBe(refused);
  },
);

const spellings = planted.flatMap(({ boundary, file, cases: plants }) =>
  [...new Set(plants.map(({ pins }) => pins))].map((pins) => ({
    boundary,
    file,
    pins,
    lines: plants.filter((plant) => plant.pins === pins).map(({ line }) => line),
  })),
);

test.each(spellings)(
  "in $boundary, every spelling of $pins is refused the same way",
  ({ file, lines }) => {
    const helps = lines.map((line) => helpsAt(file, line));

    expect(helps).toEqual(helps.map(() => helps[0]));
  },
);
