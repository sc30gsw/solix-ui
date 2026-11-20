import { globSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "vite-plus/test";
import {
  isPalette,
  ownPaletteOf,
  paletteToken,
  solidShade,
} from "#/packages/core/src/color-table.ts";
import {
  calledDeclaration,
  descendants,
  fileOf,
  openProgram,
  stringsIn,
  ts,
} from "#/scripts/syntax.ts";
import { schemeValues, tokenValues } from "#/scripts/tokens.ts";
import { contrastOn, type Oklch, parsedOklch } from "#/tests/support/oklch.ts";
import { repositoryRoot } from "#/tests/support/workspace.ts";

const themeFile = "packages/core/src/create-theme.ts";
const themeMaker = "createTheme";
const themedKey = "primaryColor";
const pageBackground = "--solix-color-body";
const minimum = 3;
const schemes = ["light", "dark"] as const;
const tokens = tokenValues();
const appSources = globSync("apps/*/src/**/*.{ts,tsx}", { cwd: repositoryRoot }).map((file) =>
  join(repositoryRoot, file),
);
const program = openProgram(appSources);

type Chosen = { where: string; written: ts.Expression | undefined };

function colourIn(token: string, scheme: (typeof schemes)[number]): Oklch | undefined {
  const value = tokens[token] === undefined ? undefined : schemeValues(tokens[token])?.[scheme];
  return value === undefined ? undefined : parsedOklch(value);
}

function themesMadeIn(file: string): Chosen[] {
  const source = program.sourceFile(file);
  if (!source) throw new Error(`${relative(repositoryRoot, file)}: TypeScript could not read it.`);
  return descendants(source).flatMap((node) => {
    if (!ts.isCallExpression(node)) return [];
    const called = calledDeclaration(program, node);
    if (
      called === undefined ||
      !ts.isFunctionDeclaration(called) ||
      called.name?.text !== themeMaker ||
      relative(repositoryRoot, fileOf(called)) !== themeFile
    ) {
      return [];
    }
    const where = `${relative(repositoryRoot, file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
    const [theme] = node.arguments;
    if (theme === undefined || !ts.isObjectLiteralExpression(theme)) {
      return [{ where, written: theme }];
    }
    const chosen = theme.properties.find(
      (property) =>
        ts.isPropertyAssignment(property) &&
        ts.isIdentifier(property.name) &&
        property.name.text === themedKey,
    );
    return chosen === undefined || !ts.isPropertyAssignment(chosen)
      ? []
      : [{ where, written: chosen.initializer }];
  });
}

const chosen = appSources.flatMap(themesMadeIn);

test("every primaryColor a demo in apps gives createTheme is a palette whose solid shade meets 3:1 against the page in both schemes, since the library promises contrast only for its default primary", () => {
  const violations = chosen.flatMap(({ where, written }) => {
    const names = stringsIn(program, written);
    if (names.length === 0) {
      return [
        `${where}: write the theme as an object literal whose ${themedKey} names a palette, so this check can read it.`,
      ];
    }
    return names.flatMap((name) => {
      if (!isPalette(name)) return [`${where}: ${themedKey} ${name} names no palette.`];
      const token = paletteToken(ownPaletteOf(name), solidShade);
      return schemes.flatMap((scheme) => {
        const front = colourIn(token, scheme);
        const page = colourIn(pageBackground, scheme);
        if (front === undefined || page === undefined) {
          return [`${where}: ${token} or ${pageBackground} cannot be measured in ${scheme}.`];
        }
        const ratio = contrastOn(front, page, page);
        return ratio >= minimum
          ? []
          : [
              `${where}: ${themedKey} ${name} draws ${token} at ${ratio.toFixed(2)}:1 against ${pageBackground} in the ${scheme} scheme, below ${minimum}:1. Choose a palette whose solid shade meets it in both schemes.`,
            ];
      });
    });
  });

  expect(chosen.length).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});
