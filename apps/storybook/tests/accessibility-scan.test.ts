import { globSync } from "node:fs";
import { findPackageJSON } from "node:module";
import { dirname, join } from "node:path";
import { expect, test } from "vite-plus/test";
import { descendants, parseAll, staticPropertyName, ts } from "../../../scripts/syntax.ts";
import { selectorsTheAccessibilityAddonLeavesUnscanned } from "#/accessibility-scan.ts";

const accessibilityAddon = "@storybook/addon-a11y";
const scanContextKeys = ["include", "exclude"];

function addonFiles(): string[] {
  const manifest = findPackageJSON(
    accessibilityAddon,
    join(import.meta.dirname, "../package.json"),
  );
  if (manifest === undefined) throw new Error(`${accessibilityAddon} does not resolve.`);
  const directory = dirname(manifest);
  return globSync("dist/**/*.js", { cwd: directory }).map((file) => join(directory, file));
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

test("the selectors the preview refuses in a canvas are the ones the accessibility addon leaves out of its scan", () => {
  const lists = parseAll(addonFiles()).flatMap(excludedSelectorsIn);

  expect(lists).toEqual([selectorsTheAccessibilityAddonLeavesUnscanned]);
});
