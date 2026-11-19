import {
  colorClass,
  type ColorVariant,
  contrastShade,
  ownPaletteOf,
  type Palette,
  paletteClass,
  paletteToken,
  type Shade,
  shadeClass,
  variantAttribute,
} from "#/packages/core/src/color-table.ts";
import { colorSchemeAttribute, defaultColorScheme } from "#/packages/core/src/color-schemes.ts";
import { stableClass } from "#/packages/core/src/stable-class.ts";

export type Scheme = "light" | "dark";
export type ContrastKind = "text" | "edge";

export type ContrastException = {
  readonly foreground: string;
  readonly background: string;
  readonly scheme: Scheme;
  readonly kind: ContrastKind;
  readonly drawnIn: string;
};

const bothSchemes: readonly Scheme[] = ["light", "dark"];
const rootPart = "root";

export function inScheme(scheme: Scheme, part: string): string {
  const other = bothSchemes.find((each) => each !== scheme);
  return scheme === defaultColorScheme
    ? `:root:not([${colorSchemeAttribute}="${other}"]) ${part}`
    : `[${colorSchemeAttribute}="${scheme}"] ${part}`;
}

export function variantPart(palette: Palette | undefined, variant: string): string {
  const named = palette === undefined ? colorClass : paletteClass(palette);
  return `.${named}[${variantAttribute}="${variant}"]:not(.${shadeClass})`;
}

export function componentPart(component: string, part: string, condition: string): string {
  const own = `.${stableClass(component, part)}`;
  if (condition === "default") return own;
  return part === rootPart
    ? `${own}${condition}`
    : `.${stableClass(component, rootPart)}${condition} ${own}`;
}

function excused(
  kind: ContrastKind,
  foreground: string,
  background: string,
  schemes: readonly Scheme[],
  part: string,
): ContrastException[] {
  return schemes.map((scheme) => ({
    foreground,
    background,
    scheme,
    kind,
    drawnIn: inScheme(scheme, part),
  }));
}

function inVariant(
  palette: Palette,
  variant: ColorVariant,
  pairs: readonly (readonly [foreground: Shade, background: Shade, schemes: readonly Scheme[]])[],
): ContrastException[] {
  const own = ownPaletteOf(palette);
  return pairs.flatMap(([foreground, background, schemes]) =>
    excused(
      "text",
      paletteToken(own, foreground),
      paletteToken(own, background),
      schemes,
      variantPart(palette, variant),
    ),
  );
}

export const contrastExceptions: readonly ContrastException[] = [
  ...(["primary", "blue"] as const).flatMap((palette) => [
    ...inVariant(palette, "filled", [
      [contrastShade, "6", bothSchemes],
      [contrastShade, "7", bothSchemes],
    ]),
    ...inVariant(palette, "light", [["9", "2", ["light"]]]),
  ]),
  ...inVariant("red", "filled", [
    [contrastShade, "6", bothSchemes],
    [contrastShade, "7", bothSchemes],
  ]),
  ...inVariant("green", "light", [
    ["9", "1", ["light"]],
    ["9", "2", ["light"]],
  ]),
  ...inVariant("green", "subtle", [["9", "1", ["light"]]]),
  ...excused(
    "text",
    paletteToken(ownPaletteOf("primary"), contrastShade),
    paletteToken(ownPaletteOf("primary"), "6"),
    bothSchemes,
    componentPart("Disclosure", "summary", "[open]"),
  ),
];

export const colorContrastRule = {
  id: "color-contrast",
  selector: `*${[
    ...new Set(
      contrastExceptions.filter(({ kind }) => kind === "text").map(({ drawnIn }) => drawnIn),
    ),
  ]
    .map((drawnIn) => `:not(${drawnIn})`)
    .join("")}`,
};
