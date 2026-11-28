import type { Scheme } from "#/spec/format.ts";

export type Tokens = {
  readonly accent: string;
  readonly accentForeground: string;
  readonly foreground: string;
  readonly neutral: string;
  readonly neutralForeground: string;
  readonly surface: string;
  readonly soft: number;
  readonly softHover: number;
  readonly softForeground: readonly [accent: number, foreground: number];
};

const accent = "oklch(0.6204 0.195 253.83)";
const snow = "oklch(0.9911 0 0)";
const eclipse = "oklch(0.2103 0.0059 285.89)";

export const schemes: readonly Scheme[] = ["light", "dark"];

export const visualReference: Record<Scheme, Tokens> = {
  light: {
    accent,
    accentForeground: snow,
    foreground: eclipse,
    neutral: "oklch(94% 0.001 286.375)",
    neutralForeground: eclipse,
    surface: "oklch(100% 0 0)",
    soft: 15,
    softHover: 20,
    softForeground: [70, 30],
  },
  dark: {
    accent,
    accentForeground: snow,
    foreground: snow,
    neutral: "oklch(27.4% 0.006 286.033)",
    neutralForeground: snow,
    surface: eclipse,
    soft: 12,
    softHover: 16,
    softForeground: [80, 30],
  },
};

export const statuses = {
  disabledOpacity: "0.5",
  pressedScale: "scale(0.97)",
  focusRingWidth: "2px",
  focusRingOffset: "2px",
  hoveredOpacity: "0.7",
} as const;

export const breakpoints = { narrow: 414, md: 768, wide: 1024 } as const;

export const functionalReference = {
  defaultGradient: { from: "#228be6", to: "#15aabf", deg: "45deg" },
} as const;

export function mix(one: string, percent: number, other: string, otherPercent?: number): string {
  const second = otherPercent === undefined ? other : `${other} ${otherPercent}%`;
  return `color-mix(in oklab, ${one} ${percent}%, ${second})`;
}
