import {
  cssColorFunctions,
  hexDigitCounts,
  hexDigits,
  isCssColorKeyword,
} from "#/src/css-colors.ts";
import { declarable } from "#/src/css-syntax.ts";

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

export type TokenPalette = (typeof palettes)[number];
export type Shade = (typeof shades)[number];

export const primaryName = "primary";
export const primaryPalette = "blue" satisfies TokenPalette;

export type OwnPalette = TokenPalette | typeof primaryName;

export const paletteAliases = {
  orange: "yellow",
} as const satisfies Record<string, TokenPalette>;

export type Palette = OwnPalette | keyof typeof paletteAliases;

export const colorClassPrefix = "solixc";
export const variantAttribute = "data-variant";
export const colorClass = colorClassPrefix;
export const colorProperty = `--${colorClassPrefix}-color`;
export const shadeClass = `${colorClassPrefix}-shade`;
export const customColorClass = `${colorClassPrefix}-custom`;
export const autoContrastClass = `${colorClassPrefix}-auto`;
export const contrastShade = "contrast" satisfies Shade;
export const textWithoutAPalette = "white";
export const contrastLuminance = Math.sqrt(1.05 * 0.05) - 0.05;
export const luminanceWeights = { r: 0.2126, g: 0.7152, b: 0.0722 } as const;

export const slotDefaults = {
  "--solixc-variant-background": "transparent",
  "--solixc-variant-hover": "var(--solixc-variant-background)",
  "--solixc-variant-color": "currentColor",
  "--solixc-variant-border": "transparent",
} as const;

type ColourToken = `--solix-color-${string}`;
type VariantSlot = keyof typeof slotDefaults;
export const writtenColor = "color";

export type SlotValue = Shade | "transparent" | ColourToken;
export type Mix = readonly [percent: number, toward: SlotValue];
export type ColorSlotValue = SlotValue | typeof writtenColor | Mix;

export type VariantRow = {
  readonly palette: Readonly<Record<VariantSlot, SlotValue>>;
  readonly color: Readonly<Record<VariantSlot, ColorSlotValue>>;
};

const neutral = {
  "--solixc-variant-background": "--solix-color-surface",
  "--solixc-variant-hover": "--solix-color-body",
  "--solixc-variant-color": "--solix-color-text",
  "--solixc-variant-border": "--solix-color-border",
} as const;

export const colorVariantTable = {
  default: { palette: neutral, color: neutral },
  filled: {
    palette: {
      "--solixc-variant-background": "6",
      "--solixc-variant-hover": "7",
      "--solixc-variant-color": "contrast",
      "--solixc-variant-border": "transparent",
    },
    color: {
      "--solixc-variant-background": writtenColor,
      "--solixc-variant-hover": [90, "contrast"],
      "--solixc-variant-color": "contrast",
      "--solixc-variant-border": "transparent",
    },
  },
  light: {
    palette: {
      "--solixc-variant-background": "1",
      "--solixc-variant-hover": "2",
      "--solixc-variant-color": "9",
      "--solixc-variant-border": "transparent",
    },
    color: {
      "--solixc-variant-background": "1",
      "--solixc-variant-hover": "2",
      "--solixc-variant-color": "9",
      "--solixc-variant-border": "transparent",
    },
  },
  outline: {
    palette: {
      "--solixc-variant-background": "transparent",
      "--solixc-variant-hover": "0",
      "--solixc-variant-color": "8",
      "--solixc-variant-border": "8",
    },
    color: {
      "--solixc-variant-background": "transparent",
      "--solixc-variant-hover": [5, "transparent"],
      "--solixc-variant-color": writtenColor,
      "--solixc-variant-border": writtenColor,
    },
  },
  subtle: {
    palette: {
      "--solixc-variant-background": "transparent",
      "--solixc-variant-hover": "1",
      "--solixc-variant-color": "9",
      "--solixc-variant-border": "transparent",
    },
    color: {
      "--solixc-variant-background": "transparent",
      "--solixc-variant-hover": [12, "transparent"],
      "--solixc-variant-color": writtenColor,
      "--solixc-variant-border": "transparent",
    },
  },
  transparent: {
    palette: {
      "--solixc-variant-background": "transparent",
      "--solixc-variant-hover": "transparent",
      "--solixc-variant-color": "9",
      "--solixc-variant-border": "transparent",
    },
    color: {
      "--solixc-variant-background": "transparent",
      "--solixc-variant-hover": "transparent",
      "--solixc-variant-color": writtenColor,
      "--solixc-variant-border": "transparent",
    },
  },
} as const satisfies Record<string, VariantRow>;

export type ColorVariant = keyof typeof colorVariantTable;

export const tintShades = {
  "1": [15, "transparent"],
  "2": [20, "transparent"],
} as const satisfies Partial<Record<Shade, Mix>>;

export const derivedShades = {
  "0": [8, "transparent"],
  "3": [35, "--solix-color-body"],
  "4": [50, "--solix-color-body"],
  "5": [75, "--solix-color-body"],
  "8": [55, "--solix-color-text"],
  "9": [70, "--solix-color-text"],
} as const satisfies Partial<Record<Shade, Mix>>;

export function paletteClass(palette: string): string {
  return `${colorClassPrefix}-${palette}`;
}

export function paletteToken(palette: OwnPalette, shade: Shade): ColourToken {
  return `--solix-color-${palette}-${shade}`;
}

export function shadeProperty(shade: string): string {
  return `--${colorClassPrefix}-shade-${shade}`;
}

export function isPalette(name: unknown): name is Palette {
  return (
    typeof name === "string" &&
    (palettes.some((palette) => palette === name) || name === primaryName || isAlias(name))
  );
}

export function isShade(name: unknown): name is Shade {
  return shades.some((shade) => shade === name);
}

function isAlias(name: string): name is keyof typeof paletteAliases {
  return Object.hasOwn(paletteAliases, name);
}

export const namedPalettes: readonly Palette[] = [
  ...palettes,
  primaryName,
  ...Object.keys(paletteAliases).filter(isAlias),
];

export function ownPaletteOf(palette: Palette): OwnPalette {
  return isAlias(palette) ? paletteAliases[palette] : palette;
}

export function shadeSource(palette: Palette, shade: Shade): ColourToken {
  return paletteToken(ownPaletteOf(palette), shade);
}

export const solidShade = "6" satisfies Shade;
const shadeSeparator = ".";
const hexDigit = `[${hexDigits.join("")}]`;
const colourSyntax = new RegExp(
  `^(?:#(?:${hexDigitCounts.map((count) => `${hexDigit}{${count}}`).join("|")})|(?:${cssColorFunctions.join("|")})\\(.+\\))$`,
);

export type ParsedColor =
  | { readonly kind: "palette"; readonly palette: Palette }
  | { readonly kind: "shade"; readonly palette: Palette; readonly value: string }
  | { readonly kind: "colour"; readonly value: string };

export function parseColor(given: unknown): ParsedColor | undefined {
  const text = typeof given === "string" ? declarable(given) : undefined;
  if (text === undefined) return undefined;
  if (isPalette(text)) return { kind: "palette", palette: text };
  const at = text.lastIndexOf(shadeSeparator);
  const palette = text.slice(0, at);
  const shade = text.slice(at + 1);
  if (at > 0 && isPalette(palette) && isShade(shade)) {
    return { kind: "shade", palette, value: `var(${shadeSource(palette, shade)})` };
  }
  return isCssColorKeyword(text) || colourSyntax.test(text)
    ? { kind: "colour", value: text }
    : undefined;
}

export function colorValueOf(written: string): string | undefined {
  const parsed = parseColor(written);
  if (parsed?.kind === "palette") return `var(${shadeSource(parsed.palette, solidShade)})`;
  return parsed?.kind === "shade" ? parsed.value : undefined;
}
