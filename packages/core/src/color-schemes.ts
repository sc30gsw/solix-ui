import {
  colorSchemeVisibilityClass,
  colorSchemeVisibilityPropNames,
  colorSchemeVisibilityTable,
} from "#/src/style-prop-table.ts";

export const colorSchemeAttribute = "data-color-scheme";

export const cssColorSchemeOf = {
  light: "light",
  dark: "dark",
  auto: "light dark",
} as const;

export type SolixColorScheme = keyof typeof cssColorSchemeOf;

export const systemColorScheme = "auto" satisfies SolixColorScheme;

export type SolixComputedColorScheme = Exclude<SolixColorScheme, typeof systemColorScheme>;

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

export function inScheme(
  scheme: SolixComputedColorScheme,
  rule: (selector: string) => string,
): string[] {
  return [
    rule(where(scheme)),
    `@media ${prefersColorScheme(scheme)}{${rule(where(systemColorScheme))}}`,
  ];
}

export function colorSchemeRules(tokens: TokensPerScheme): string {
  return [
    ...colorSchemes.map((scheme) => `${where(scheme)}{color-scheme:${cssColorSchemeOf[scheme]}}`),
    ...computedColorSchemes.flatMap((scheme) => [
      ...(tokens[scheme].length === 0
        ? []
        : inScheme(scheme, (selector) => `${selector}{${declared(tokens[scheme])}}`)),
      ...colorSchemeVisibilityPropNames
        .filter((name) => colorSchemeVisibilityTable[name].scheme === scheme)
        .flatMap((name) =>
          inScheme(
            scheme,
            (selector) => `${selector} .${colorSchemeVisibilityClass(name)}{display:none}`,
          ),
        ),
    ]),
  ].join("\n");
}
