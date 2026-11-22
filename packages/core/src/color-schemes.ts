import type { SolixComputedColorScheme } from "#/src/computed-color-scheme.ts";
import { hiddenInAScheme } from "#/src/style-prop-table.ts";

export const colorSchemeAttribute = "data-color-scheme";

export const cssColorSchemeOf = {
  light: "light",
  dark: "dark",
  auto: "light dark",
} as const;

export type SolixColorScheme = keyof typeof cssColorSchemeOf;

export type ColorSchemeOptions = {
  /** The colour scheme while nothing is stored; `auto` follows the system. */
  defaultColorScheme?: SolixColorScheme;
  forceColorScheme?: SolixComputedColorScheme;
};

export const systemColorScheme = "auto" satisfies SolixColorScheme;

export const defaultColorScheme = "light" satisfies SolixComputedColorScheme;

export function isColorScheme(value: unknown): value is SolixColorScheme {
  return typeof value === "string" && Object.hasOwn(cssColorSchemeOf, value);
}

function isComputedColorScheme(scheme: SolixColorScheme): scheme is SolixComputedColorScheme {
  return scheme !== systemColorScheme;
}

export const colorSchemes = Object.keys(cssColorSchemeOf).filter(isColorScheme);
export const computedColorSchemes = colorSchemes.filter(isComputedColorScheme);

export function prefersColorScheme(scheme: SolixComputedColorScheme): string {
  return `(prefers-color-scheme: ${scheme})`;
}

export function resolvedColorScheme(
  scheme: SolixColorScheme,
  prefersDark: boolean,
): SolixComputedColorScheme {
  if (isComputedColorScheme(scheme)) return scheme;
  return prefersDark ? "dark" : "light";
}

type Declarations = readonly (readonly [property: string, value: string])[];

export type TokensPerScheme = Readonly<Record<SolixComputedColorScheme, Declarations>>;

function where(scheme: SolixColorScheme): string {
  return `[${colorSchemeAttribute}="${scheme}"]`;
}

function declared(declarations: Declarations): string {
  return declarations.map(([property, value]) => `${property}:${value}`).join(";");
}

function hiding(scheme: SolixComputedColorScheme): Declarations {
  return hiddenInAScheme.map(({ scheme: hiddenIn, property }) => [
    property,
    hiddenIn === scheme ? "none" : "initial",
  ]);
}

export function inScheme(scheme: SolixComputedColorScheme, declarations: Declarations): string[] {
  const body = `{${declared(declarations)}}`;
  return [
    `${where(scheme)}${body}`,
    `@media ${prefersColorScheme(scheme)}{${where(systemColorScheme)}${body}}`,
  ];
}

export function colorSchemeRules(tokens: TokensPerScheme): string {
  return [
    `:root{${declared(hiding(defaultColorScheme))}}`,
    ...colorSchemes.map((scheme) => `${where(scheme)}{color-scheme:${cssColorSchemeOf[scheme]}}`),
    ...computedColorSchemes.flatMap((scheme) =>
      inScheme(scheme, [...tokens[scheme], ...hiding(scheme)]),
    ),
    ...hiddenInAScheme.map(
      ({ className, property }) => `.${className}{display:var(${property},revert-layer)}`,
    ),
  ].join("\n");
}
