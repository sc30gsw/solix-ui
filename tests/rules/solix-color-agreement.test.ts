import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { namedPalettes, parseColor, shades } from "#/packages/core/src/color-table.ts";
import { cssColorFunctions, cssColorKeywords, hexDigits } from "#/packages/core/src/css-colors.ts";
import { characterThatEndsADeclaration } from "#/packages/core/src/css-syntax.ts";
import { descendants, openProgram, stringsIn, ts, virtualFile } from "#/scripts/syntax.ts";
import { repositoryRoot } from "#/tests/support/workspace.ts";

const colorsModule = join(repositoryRoot, "packages/core/src/colors.ts");
const taken = "taken";

function spellings(name: string): string[] {
  return [name, name.toLowerCase(), name.toUpperCase(), `${name[0].toUpperCase()}${name.slice(1)}`];
}

const hexRun = (count: number, digit: (at: number) => string) =>
  `#${Array.from({ length: count }, (_, at) => digit(at)).join("")}`;

const candidates = [
  ...new Set([
    ...namedPalettes.flatMap(spellings),
    ...namedPalettes.flatMap((palette) =>
      [...shades, "10", "-1"].map((shade) => `${palette}.${shade}`),
    ),
    ...cssColorKeywords.flatMap(spellings),
    ...cssColorFunctions.flatMap((name) => [
      ...spellings(name).map((spelt) => `${spelt}(1 2 3)`),
      `${name}()`,
      `${name}(1;2)`,
    ]),
    ...Array.from({ length: 11 }, (_, count) => [
      hexRun(count, (at) => hexDigits[(at * 7) % hexDigits.length]),
      ...Array.from({ length: count }, (_, wrong) =>
        hexRun(count, (at) => (at === wrong ? "z" : hexDigits[at % hexDigits.length])),
      ),
    ]).flat(),
    "",
    "inherit",
    "initial",
    "red-6",
    "red;",
    "a{b",
    "bleu",
  ]),
];

const gapsOfTheType: [reason: string, inGap: (written: string) => boolean][] = [
  [
    "the type checks the first three digits of a hex colour, since a union of every count of digits is too large for the compiler",
    (written) => new RegExp(`^#[${hexDigits.join("")}]{3}`).test(written),
  ],
  [
    "the type does not read the arguments of a colour function",
    (written) =>
      cssColorFunctions.some((name) => written.startsWith(`${name}(`) && written.endsWith(")")),
  ],
  [
    "the type does not look for a character that ends a declaration",
    (written) => characterThatEndsADeclaration.test(written),
  ],
];

function typeVerdicts(): Map<string, boolean> {
  const declarations = candidates.map(
    (written, at) =>
      `declare const candidate${at}: ${JSON.stringify(written)} extends SolixColor ? "${taken}" : "refused";`,
  );
  const file = virtualFile(
    `import type { SolixColor } from ${JSON.stringify(colorsModule)};\n${declarations.join("\n")}\nexport {};\n`,
    ".ts",
  );
  const program = openProgram([file]);
  try {
    const source = program.sourceFile(file);
    if (!source) throw new Error(`${file}: TypeScript could not read it.`);
    const verdicts = new Map<string, boolean>();
    for (const node of descendants(source)) {
      if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name)) continue;
      const at = Number(node.name.text.slice("candidate".length));
      const [verdict] = stringsIn(program, node.name);
      if (verdict === undefined) throw new Error(`${candidates[at]}: the type gave no verdict.`);
      verdicts.set(candidates[at], verdict === taken);
    }
    return verdicts;
  } finally {
    program.dispose();
  }
}

test("SolixColor takes every value the run-time parser takes, and refuses every value it refuses but where the type cannot look, which the README names", () => {
  const verdicts = typeVerdicts();

  expect(verdicts.size).toBe(candidates.length);
  const disagreements = candidates.flatMap((written) => {
    const byType = verdicts.get(written);
    const atRunTime = parseColor(written) !== undefined;
    if (byType === atRunTime) return [];
    if (byType && gapsOfTheType.some(([, inGap]) => inGap(written))) return [];
    return [
      `${JSON.stringify(written)}: the type ${byType ? "takes" : "refuses"} it, the run time ${atRunTime ? "takes" : "refuses"} it.`,
    ];
  });

  expect(disagreements).toEqual([]);
  expect(
    gapsOfTheType.map(([reason, inGap]) => [
      reason,
      candidates.some((written) => verdicts.get(written) && !parseColor(written) && inGap(written)),
    ]),
  ).toEqual(gapsOfTheType.map(([reason]) => [reason, true]));
});
