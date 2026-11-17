import { cascadeLayerOrder, libraryCascadeLayer } from "./cascade-layers";
import type { Scale } from "./style-prop-table";
import { characterThatEndsADeclaration, type ScaleKey } from "./style-props";
import { tokens } from "./tokens.stylex";

export const scaleOfThemeKey = {
  spacing: "spacing",
  radius: "radius",
  fontSizes: "font-size",
  lineHeights: "line-height",
} as const satisfies Record<string, Scale>;

type ThemeKey = keyof typeof scaleOfThemeKey;

export type SolixTheme = {
  [Key in ThemeKey]?: { [Size in ScaleKey<(typeof scaleOfThemeKey)[Key]>]?: string | null };
};

const characterThatEndsAStyleElement = /</;

function isWritable(text: string): boolean {
  return !characterThatEndsADeclaration.test(text) && !characterThatEndsAStyleElement.test(text);
}

function isThemeKey(key: string): key is ThemeKey {
  return Object.hasOwn(scaleOfThemeKey, key);
}

function declarationsOf(theme: SolixTheme): string[] {
  return Object.entries(theme).flatMap(([key, sizes]) => {
    if (!isThemeKey(key) || typeof sizes !== "object" || sizes === null) return [];
    return Object.entries(sizes).flatMap(([size, value]) => {
      const token = `--solix-${scaleOfThemeKey[key]}-${size}`;
      return typeof value === "string" && isWritable(value) && Object.hasOwn(tokens, token)
        ? [`${token}:${value};`]
        : [];
    });
  });
}

export function themeStyleSheet(theme: SolixTheme, selector: string): string | undefined {
  const declarations = declarationsOf(theme);
  if (declarations.length === 0 || !isWritable(selector)) return undefined;
  return `${cascadeLayerOrder}@layer ${libraryCascadeLayer}{${selector}{${declarations.join("")}}}`;
}

export function createTheme(theme: SolixTheme): SolixTheme {
  return theme;
}
