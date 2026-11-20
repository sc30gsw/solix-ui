import postcss from "postcss";
import { expect, test } from "vite-plus/test";
import { paletteClass } from "#/src/color-table.ts";
import { stylesheet } from "#/tests/built-library.ts";
import { tokenValues } from "../../../scripts/tokens";

function shadesOf(palette: string): string[] {
  const values: string[] = [];
  postcss.parse(stylesheet).walkRules(`.${paletteClass(palette)}`, (rule) => {
    rule.walkDecls((declaration) => {
      values.push(`${declaration.prop}:${declaration.value}`);
    });
  });
  return values;
}

test("orange is an alias of yellow: its class sets every shade as yellow's does, and the colour tokens hold none of its own", () => {
  expect(shadesOf("yellow").length).toBeGreaterThan(0);
  expect(shadesOf("orange")).toEqual(shadesOf("yellow"));
  expect(
    Object.keys(tokenValues()).filter((name) => name.startsWith("--solix-color-orange-")),
  ).toEqual([]);
});
