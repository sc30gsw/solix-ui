import { stableClass } from "#/packages/core/src/stable-class.ts";
import {
  type ColorVariant,
  contrastShade,
  ownPaletteOf,
  type Palette,
  paletteClass,
  paletteToken,
  type Shade,
  variantAttribute,
} from "#/packages/core/src/color-table.ts";

export type Scheme = "light" | "dark";

export type ContrastException = {
  readonly foreground: string;
  readonly background: string;
  readonly scheme: Scheme;
  readonly drawnIn: string;
};

const bothSchemes: readonly Scheme[] = ["light", "dark"];

function inVariant(
  palette: Palette,
  variant: ColorVariant,
  pairs: readonly (readonly [foreground: Shade, background: Shade, schemes: readonly Scheme[]])[],
): ContrastException[] {
  const drawnIn = `.${paletteClass(palette)}[${variantAttribute}="${variant}"]`;
  return pairs.flatMap(([foreground, background, schemes]) =>
    schemes.map((scheme) => ({
      foreground: paletteToken(ownPaletteOf(palette), foreground),
      background: paletteToken(ownPaletteOf(palette), background),
      scheme,
      drawnIn,
    })),
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
  ...bothSchemes.map((scheme) => ({
    foreground: paletteToken(ownPaletteOf("primary"), contrastShade),
    background: paletteToken(ownPaletteOf("primary"), "6"),
    scheme,
    drawnIn: `.${stableClass("Disclosure", "summary")}`,
  })),
];

export const colorContrastRule = {
  id: "color-contrast",
  selector: `*${[...new Set(contrastExceptions.map(({ drawnIn }) => drawnIn))]
    .map((drawnIn) => `:not(${drawnIn})`)
    .join("")}`,
};
