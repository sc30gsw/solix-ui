import type { primaryColors } from "#/src/primary-colors.stylex.ts";
import type { variantColors } from "#/src/variant-colors.stylex.ts";

export const palettes = [
  "dark",
  "gray",
  "red",
  "pink",
  "grape",
  "violet",
  "indigo",
  "blue",
  "cyan",
  "teal",
  "green",
  "lime",
  "yellow",
] as const;

export const shades = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "contrast"] as const;

export type OwnPalette = (typeof palettes)[number];
export type Shade = (typeof shades)[number];

export const primaryPalette = "blue" satisfies OwnPalette;
export const primaryAlias = "primary";

export const paletteAliases = {
  [primaryAlias]: primaryPalette,
  orange: "yellow",
} as const satisfies Record<string, OwnPalette>;

export type Palette = OwnPalette | keyof typeof paletteAliases;

export const colorClassPrefix = "sxc";
export const colorLayer = "colors";
export const variantAttribute = "data-variant";
export const colorClass = colorClassPrefix;
export const colorProperty = `--${colorClassPrefix}-color`;
export const shadeClass = `${colorClassPrefix}-shade`;
export const customColorClass = `${colorClassPrefix}-custom`;
export const fixedContrastClass = `${colorClassPrefix}-fixed`;
export const contrastShade = "contrast" satisfies Shade;
export const textWithoutContrast = "white";
export const contrastLuminance = Math.sqrt(1.05 * 0.05) - 0.05;

type ColourToken = `--solix-color-${string}`;
type PrimaryAlias = Extract<keyof typeof primaryColors, `--${string}`>;
type VariantSlot = Extract<keyof typeof variantColors, `--${string}`>;
type SlotValue = Shade | "transparent" | ColourToken;

export const colorVariantTable = {
  default: {
    "--sx-variant-background": "--solix-color-surface",
    "--sx-variant-hover": "--solix-color-body",
    "--sx-variant-color": "--solix-color-text",
    "--sx-variant-border": "--solix-color-border",
  },
  filled: {
    "--sx-variant-background": "6",
    "--sx-variant-hover": "7",
    "--sx-variant-color": "contrast",
    "--sx-variant-border": "transparent",
  },
  light: {
    "--sx-variant-background": "1",
    "--sx-variant-hover": "2",
    "--sx-variant-color": "9",
    "--sx-variant-border": "transparent",
  },
  outline: {
    "--sx-variant-background": "transparent",
    "--sx-variant-hover": "0",
    "--sx-variant-color": "8",
    "--sx-variant-border": "8",
  },
  subtle: {
    "--sx-variant-background": "transparent",
    "--sx-variant-hover": "1",
    "--sx-variant-color": "9",
    "--sx-variant-border": "transparent",
  },
  transparent: {
    "--sx-variant-background": "transparent",
    "--sx-variant-hover": "transparent",
    "--sx-variant-color": "9",
    "--sx-variant-border": "transparent",
  },
} as const satisfies Record<string, Record<VariantSlot, SlotValue>>;

export type ColorVariant = keyof typeof colorVariantTable;

export const derivedShades = {
  "0": [8, "transparent"],
  "1": [15, "transparent"],
  "2": [20, "transparent"],
  "3": [35, "var(--solix-color-body)"],
  "4": [50, "var(--solix-color-body)"],
  "5": [75, "var(--solix-color-body)"],
  "8": [55, "var(--solix-color-text)"],
  "9": [70, "var(--solix-color-text)"],
} as const satisfies Partial<Record<Shade, readonly [percent: number, toward: string]>>;

export function paletteClass(palette: string): string {
  return `${colorClassPrefix}-${palette}`;
}

export function paletteToken(palette: OwnPalette, shade: Shade): ColourToken {
  return `--solix-color-${palette}-${shade}`;
}

export function primaryProperty(shade: Shade): PrimaryAlias {
  return `--solix-${primaryAlias}-${shade}`;
}

export function shadeProperty(shade: string): string {
  return `--${colorClassPrefix}-shade-${shade}`;
}

export function isPalette(name: unknown): name is Palette {
  return (
    typeof name === "string" && (palettes.some((palette) => palette === name) || isAlias(name))
  );
}

export function isShade(name: unknown): name is Shade {
  return shades.some((shade) => shade === name);
}

function isAlias(name: string): name is keyof typeof paletteAliases {
  return Object.hasOwn(paletteAliases, name);
}

export function ownPaletteOf(palette: Palette): OwnPalette {
  return isAlias(palette) ? paletteAliases[palette] : palette;
}
