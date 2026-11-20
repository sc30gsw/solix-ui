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
  declarationsOf,
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

function lineOf(file: string, source: ts.SourceFile, node: ts.Node): string {
  return `${relative(repositoryRoot, file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
}

function declaresTheThemedKey(declaration: ts.Node): boolean {
  return (
    relative(repositoryRoot, fileOf(declaration)) === themeFile &&
    ts.isPropertySignatureDeclaration(declaration) &&
    ts.isIdentifier(declaration.name) &&
    declaration.name.text === themedKey
  );
}

function isThemeMaker(node: ts.CallExpression): boolean {
  const called = calledDeclaration(program, node);
  return (
    called !== undefined &&
    ts.isFunctionDeclaration(called) &&
    called.name?.text === themeMaker &&
    relative(repositoryRoot, fileOf(called)) === themeFile
  );
}

function themesMadeIn(file: string): Chosen[] {
  const source = program.sourceFile(file);
  if (!source) throw new Error(`${relative(repositoryRoot, file)}: TypeScript could not read it.`);
  return descendants(source).flatMap((node): Chosen[] => {
    if (ts.isCallExpression(node) && isThemeMaker(node)) {
      const [theme] = node.arguments;
      return theme === undefined || !ts.isObjectLiteralExpression(theme)
        ? [{ where: lineOf(file, source, node), written: theme }]
        : [];
    }
    return ts.isPropertyAssignment(node) &&
      declarationsOf(program, node.name).some(declaresTheThemedKey)
      ? [{ where: lineOf(file, source, node), written: node.initializer }]
      : [];
  });
}

const chosen = appSources.flatMap(themesMadeIn);

test("every primaryColor a demo in apps writes in a theme, given to createTheme or straight to a provider's theme, is a palette whose solid shade meets 3:1 against the page in both schemes, since the library promises contrast only for its default primary", () => {
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
