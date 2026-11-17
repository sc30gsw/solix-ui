import { globSync } from "node:fs";
import { findPackageJSON } from "node:module";
import { dirname, join } from "node:path";
import { expect, test } from "vite-plus/test";
import { descendants, parseAll, staticPropertyName, ts } from "../../../scripts/syntax.ts";
import {
  globalSwitchesThatSkipTheAccessibilityScan,
  selectorsTheAccessibilityAddonLeavesUnscanned,
} from "#/accessibility-scan.ts";

const accessibilityAddon = "@storybook/addon-a11y";
const scanContextKeys = ["include", "exclude"];
const globalsOfTheStory = "globals";
const reRead = `Read what ${accessibilityAddon}'s afterEach and run, in its built files, skip or leave out of the scan, and write it again in apps/storybook/accessibility-scan.ts.`;

function addonSources(): ts.SourceFile[] {
  const manifest = findPackageJSON(
    accessibilityAddon,
    join(import.meta.dirname, "../package.json"),
  );
  if (manifest === undefined) throw new Error(`${accessibilityAddon} does not resolve.`);
  const directory = dirname(manifest);
  return parseAll(
    globSync("dist/**/*.js", { cwd: directory }).map((file) => join(directory, file)),
  );
}

function excludedSelectorsIn(source: ts.SourceFile): string[][] {
  return descendants(source).flatMap((node) => {
    if (!ts.isObjectLiteralExpression(node)) return [];
    const keys = node.properties.map((property) => staticPropertyName(property));
    if (!scanContextKeys.every((key) => keys.includes(key))) return [];
    return node.properties.flatMap((property) =>
      staticPropertyName(property) === "exclude" &&
      ts.isPropertyAssignment(property) &&
      ts.isArrayLiteralExpression(property.initializer)
        ? [
            property.initializer.elements.flatMap((element) =>
              ts.isStringLiteralLikeNode(element) ? [element.text] : [],
            ),
          ]
        : [],
    );
  });
}

function chainOf(
  access: ts.PropertyAccessExpression,
): { root: string; path: string[] } | undefined {
  const path = [access.name.text];
  let inner: ts.Expression = access.expression;
  while (ts.isPropertyAccessExpression(inner)) {
    path.unshift(inner.name.text);
    inner = inner.expression;
  }
  return ts.isIdentifier(inner) ? { root: inner.text, path } : undefined;
}

function isLongestChain(access: ts.PropertyAccessExpression): boolean {
  const holder = access.parent;
  return !(ts.isPropertyAccessExpression(holder) && holder.expression === access);
}

function globalPathsReadIn(source: ts.SourceFile): string[][] {
  const chains = descendants(source)
    .filter(ts.isPropertyAccessExpression)
    .filter(isLongestChain)
    .flatMap((access) => {
      const chain = chainOf(access);
      return chain === undefined ? [] : [{ access, ...chain }];
    });
  const aliasOf = new Map(
    chains.flatMap(({ access, root, path }) =>
      root === globalsOfTheStory &&
      ts.isVariableDeclaration(access.parent) &&
      ts.isIdentifier(access.parent.name)
        ? [[access.parent.name.text, path] as const]
        : [],
    ),
  );
  return chains.flatMap(({ access, root, path }) => {
    if (ts.isVariableDeclaration(access.parent)) return [];
    const base = root === globalsOfTheStory ? [] : aliasOf.get(root);
    return base === undefined ? [] : [[...base, ...path]];
  });
}

test("the selectors the preview refuses in a canvas are the ones the accessibility addon leaves out of its scan", () => {
  expect(addonSources().flatMap(excludedSelectorsIn), reRead).toEqual([
    selectorsTheAccessibilityAddonLeavesUnscanned,
  ]);
});

test("the global switches the preview refuses are the globals the accessibility addon reads before it scans", () => {
  const read = [
    ...new Set(
      addonSources()
        .flatMap(globalPathsReadIn)
        .map((path) => path.join(".")),
    ),
  ].sort();

  expect(read, reRead).toEqual(
    globalSwitchesThatSkipTheAccessibilityScan.map((path) => path.join(".")).sort(),
  );
});
