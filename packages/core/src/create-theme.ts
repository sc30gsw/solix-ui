import {
  isPalette,
  type Palette,
  primaryAlias,
  primaryProperty,
  shades,
  shadeSource,
} from "#/src/color-table.ts";
import { colorSchemeAttribute } from "#/src/color-schemes.ts";
import { layerOrder, libraryCascadeLayer, type Scale } from "#/src/style-prop-table.ts";
import { characterThatEndsADeclaration, type ScaleKey, tokenOf } from "#/src/style-props.ts";

export const scaleOfThemeKey = {
  spacing: "spacing",
  radius: "radius",
  fontSizes: "font-size",
  lineHeights: "line-height",
  shadows: "shadow",
} as const satisfies Record<string, Scale>;

type ThemeKey = keyof typeof scaleOfThemeKey;

export type SolixTheme = {
  [Key in ThemeKey]?: { [Size in ScaleKey<(typeof scaleOfThemeKey)[Key]>]?: string | null };
} & { primaryColor?: Exclude<Palette, typeof primaryAlias> };

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

function primaryDeclarationsOf(primaryColor: unknown): string[] {
  if (!isPalette(primaryColor) || primaryColor === primaryAlias) return [];
  return shades.map(
    (shade) => `${primaryProperty(shade)}:var(${shadeSource(primaryColor, shade)});`,
  );
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
  const placed: [rule: (block: string) => string, declarations: string[]][] = [
    [(block) => `${selector}${block}`, declarationsOf(theme)],
    [
      (block) => `@scope (${selector}){:where(:scope,[${colorSchemeAttribute}])${block}}`,
      primaryDeclarationsOf(theme.primaryColor),
    ],
  ];
  const rules = placed.flatMap(([rule, declarations]) =>
    declarations.length === 0 ? [] : [rule(`{${declarations.join("")}}`)],
  );
  if (rules.length === 0 || !isWritable(selector)) return undefined;
  return `${layerOrder}@layer ${libraryCascadeLayer}{${rules.join("")}}`;
}

export function createTheme(theme: SolixTheme): SolixTheme {
  return theme;
}
