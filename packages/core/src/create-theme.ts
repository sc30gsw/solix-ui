import { cascadeLayerOrder, libraryCascadeLayer } from "./cascade-layers";
import type { Scale } from "./style-prop-table";
import { characterThatEndsADeclaration, type ScaleKey, tokenOf } from "./style-props";

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

const characterThatLeavesItsPlace = /[<!\\]|\/\*/;

const closerOf: Readonly<Record<string, string>> = { "(": ")", "[": "]" };

const quotes = ['"', "'"];

function isClosed(text: string): boolean {
  const open: string[] = [];
  let quote: string | undefined;
  for (const character of text) {
    if (quote !== undefined) {
      if (character === quote) quote = undefined;
    } else if (quotes.includes(character)) {
      quote = character;
    } else if (Object.hasOwn(closerOf, character)) {
      open.push(closerOf[character]);
    } else if (Object.values(closerOf).includes(character) && open.pop() !== character) {
      return false;
    }
  }
  return quote === undefined && open.length === 0;
}

function isWritable(text: string): boolean {
  return (
    !characterThatEndsADeclaration.test(text) &&
    !characterThatLeavesItsPlace.test(text) &&
    isClosed(text)
  );
}

function isThemeKey(key: string): key is ThemeKey {
  return Object.hasOwn(scaleOfThemeKey, key);
}

function declarationsOf(theme: SolixTheme): string[] {
  return Object.entries(theme).flatMap(([key, sizes]) => {
    if (!isThemeKey(key) || typeof sizes !== "object" || sizes === null) return [];
    return Object.entries(sizes).flatMap(([size, value]) => {
      const token = tokenOf(scaleOfThemeKey[key], size);
      return token !== undefined && typeof value === "string" && isWritable(value)
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
