import type { JSX } from "@solidjs/web";
import type { SolixComputedColorScheme } from "#/src/computed-color-scheme.ts";
import type { tokens } from "#/src/tokens.stylex.ts";
import type { variantColors } from "#/src/variant-colors.stylex.ts";

export type Scale =
  | "spacing"
  | "font-size"
  | "line-height"
  | "radius"
  | "color"
  | "container-size"
  | "shadow"
  | "control-height"
  | "control-padding";

export type PropertyRow = {
  readonly property: keyof JSX.CSSProperties;
  readonly kind: "length" | "raw";
  readonly scale?: Scale;
  readonly within?: string;
};

type AliasRow = { readonly aliasOf: string };

type ChildRule = {
  readonly when?: string;
  readonly path: readonly [string, ...string[]];
  readonly set: (own: string) => Readonly<Record<string, string>>;
};

type VariableRow = {
  readonly kind: "length" | "raw";
  readonly scale?: Scale;
  readonly responsive: boolean;
  readonly children?: readonly ChildRule[];
};

export const stylePropClassPrefix = "sx";
export const libraryCascadeLayer = "solix";
export const componentLayer = "components";
export const stylePropLayer = "style-props";
export const colorSchemeLayer = "color-scheme";
export const containerQueryLayer = "container-queries";
export const childRuleLayer = "child-rules";
export const hiddenLayer = "hidden";
export const behaviourSdkLayer = "ui-sdk";
export const libraryStyleMark = "data-solix-rules";

export const breakpointWidths = {
  xs: "36em",
  sm: "48em",
  md: "62em",
  lg: "75em",
  xl: "88em",
} as const;

export const stylePropTable = {
  m: { property: "margin", kind: "length", scale: "spacing" },
  mx: { property: "margin-inline", kind: "length", scale: "spacing", within: "m" },
  my: { property: "margin-block", kind: "length", scale: "spacing", within: "m" },
  mt: { property: "margin-top", kind: "length", scale: "spacing", within: "my" },
  mb: { property: "margin-bottom", kind: "length", scale: "spacing", within: "my" },
  ml: { property: "margin-left", kind: "length", scale: "spacing", within: "mx" },
  mr: { property: "margin-right", kind: "length", scale: "spacing", within: "mx" },
  ms: { property: "margin-inline-start", kind: "length", scale: "spacing", within: "mx" },
  me: { property: "margin-inline-end", kind: "length", scale: "spacing", within: "mx" },
  mis: { aliasOf: "ms" },
  mie: { aliasOf: "me" },
  p: { property: "padding", kind: "length", scale: "spacing" },
  px: { property: "padding-inline", kind: "length", scale: "spacing", within: "p" },
  py: { property: "padding-block", kind: "length", scale: "spacing", within: "p" },
  pt: { property: "padding-top", kind: "length", scale: "spacing", within: "py" },
  pb: { property: "padding-bottom", kind: "length", scale: "spacing", within: "py" },
  pl: { property: "padding-left", kind: "length", scale: "spacing", within: "px" },
  pr: { property: "padding-right", kind: "length", scale: "spacing", within: "px" },
  ps: { property: "padding-inline-start", kind: "length", scale: "spacing", within: "px" },
  pe: { property: "padding-inline-end", kind: "length", scale: "spacing", within: "px" },
  pis: { aliasOf: "ps" },
  pie: { aliasOf: "pe" },
  w: { property: "width", kind: "length", scale: "spacing" },
  miw: { property: "min-width", kind: "length", scale: "spacing" },
  maw: { property: "max-width", kind: "length", scale: "spacing" },
  h: { property: "height", kind: "length", scale: "spacing" },
  mih: { property: "min-height", kind: "length", scale: "spacing" },
  mah: { property: "max-height", kind: "length", scale: "spacing" },
  c: { property: "color", kind: "raw", scale: "color" },
  bg: { property: "background", kind: "raw", scale: "color" },
  bgsz: { property: "background-size", kind: "length", within: "bg" },
  bgp: { property: "background-position", kind: "raw", within: "bg" },
  bgr: { property: "background-repeat", kind: "raw", within: "bg" },
  bga: { property: "background-attachment", kind: "raw", within: "bg" },
  opacity: { property: "opacity", kind: "raw" },
  ff: { property: "font-family", kind: "raw" },
  fz: { property: "font-size", kind: "length", scale: "font-size" },
  fw: { property: "font-weight", kind: "raw" },
  lts: { property: "letter-spacing", kind: "length" },
  ta: { property: "text-align", kind: "raw" },
  lh: { property: "line-height", kind: "raw", scale: "line-height" },
  fs: { property: "font-style", kind: "raw" },
  tt: { property: "text-transform", kind: "raw" },
  td: { property: "text-decoration", kind: "raw" },
  bd: { property: "border", kind: "raw" },
  bdrs: { property: "border-radius", kind: "length", scale: "radius" },
  pos: { property: "position", kind: "raw" },
  inset: { property: "inset", kind: "length" },
  top: { property: "top", kind: "length", within: "inset" },
  left: { property: "left", kind: "length", within: "inset" },
  bottom: { property: "bottom", kind: "length", within: "inset" },
  right: { property: "right", kind: "length", within: "inset" },
  display: { property: "display", kind: "raw" },
  flex: { property: "flex", kind: "raw" },
} as const satisfies Record<string, PropertyRow | AliasRow>;

export const variableTable = {
  Button: {
    "button-fz": { kind: "length", scale: "font-size", responsive: false },
    "button-height": { kind: "length", scale: "control-height", responsive: false },
    "button-padding-x": { kind: "length", scale: "control-padding", responsive: false },
    "button-radius": { kind: "length", scale: "radius", responsive: false },
  },
  Container: {
    "container-size": {
      kind: "length",
      scale: "container-size",
      responsive: false,
      children: [
        { when: '[data-strategy="grid"]', path: ["*"], set: () => ({ "grid-column": "2" }) },
        {
          when: '[data-strategy="grid"]',
          path: ["[data-breakout]"],
          set: () => ({ "grid-column": "1/-1" }),
        },
        {
          when: '[data-strategy="grid"]',
          path: ["[data-breakout]", "[data-container]"],
          set: (own) => ({ "max-width": own, "margin-inline": "auto" }),
        },
      ],
    },
  },
  Flex: {
    "flex-align": { kind: "raw", responsive: true },
    "flex-column-gap": { kind: "length", scale: "spacing", responsive: true },
    "flex-direction": { kind: "raw", responsive: true },
    "flex-gap": { kind: "length", scale: "spacing", responsive: true },
    "flex-justify": { kind: "raw", responsive: true },
    "flex-row-gap": { kind: "length", scale: "spacing", responsive: true },
    "flex-wrap": { kind: "raw", responsive: true },
  },
  Grid: {
    "grid-align": { kind: "raw", responsive: false },
    "grid-column-gap": { kind: "length", scale: "spacing", responsive: true },
    "grid-gap": { kind: "length", scale: "spacing", responsive: true },
    "grid-justify": { kind: "raw", responsive: false },
    "grid-overflow": { kind: "raw", responsive: false },
    "grid-row-gap": { kind: "length", scale: "spacing", responsive: true },
  },
  GridCol: {
    "col-align-self": { kind: "raw", responsive: true },
    "col-flex-basis": { kind: "raw", responsive: true },
    "col-flex-grow": { kind: "raw", responsive: true },
    "col-max-width": { kind: "raw", responsive: true },
    "col-offset": { kind: "raw", responsive: true },
    "col-order": { kind: "raw", responsive: true },
    "col-width": { kind: "raw", responsive: true },
  },
  Group: {
    "group-align": { kind: "raw", responsive: false },
    "group-child-width": {
      kind: "raw",
      responsive: false,
      children: [{ path: ["*"], set: (own) => ({ "flex-grow": "1", "max-width": own }) }],
    },
    "group-gap": { kind: "length", scale: "spacing", responsive: false },
    "group-justify": { kind: "raw", responsive: false },
    "group-wrap": { kind: "raw", responsive: false },
  },
  SimpleGrid: {
    "sg-auto-rows": { kind: "raw", responsive: false },
    "sg-cols": { kind: "raw", responsive: true },
    "sg-min-col-width": { kind: "length", responsive: false },
    "sg-spacing-x": { kind: "length", scale: "spacing", responsive: true },
    "sg-spacing-y": { kind: "length", scale: "spacing", responsive: true },
  },
  Space: {
    "space-min-height": { kind: "length", scale: "spacing", responsive: true },
    "space-min-width": { kind: "length", scale: "spacing", responsive: true },
  },
  Stack: {
    "stack-align": { kind: "raw", responsive: false },
    "stack-gap": { kind: "length", scale: "spacing", responsive: false },
    "stack-justify": { kind: "raw", responsive: false },
  },
} as const satisfies Record<string, Record<string, VariableRow>>;

type HiddenAtAWidth = { className: string; query: (width: string) => string };
type HiddenInAScheme = { className: string; scheme: SolixComputedColorScheme };

const visibilityTable = {
  hiddenFrom: { className: "hidden-from", query: (width: string) => `(min-width: ${width})` },
  visibleFrom: { className: "visible-from", query: (width: string) => `(width < ${width})` },
  lightHidden: { className: "light-hidden", scheme: "light" },
  darkHidden: { className: "dark-hidden", scheme: "dark" },
} satisfies Record<string, HiddenAtAWidth | HiddenInAScheme>;

export const baseKey = "base";

type Rows = typeof stylePropTable;
export type StylePropName = keyof Rows;
export type CanonicalStylePropName = {
  [Name in StylePropName]: Rows[Name] extends AliasRow ? never : Name;
}[StylePropName];
export type RowOf<Name extends StylePropName> = Rows[Name] extends {
  aliasOf: infer Target extends StylePropName;
}
  ? Rows[Target]
  : Rows[Name];
export type Breakpoint = keyof typeof breakpointWidths;
export type ResponsiveKey = typeof baseKey | Breakpoint;
export type VisibilityPropName = keyof typeof visibilityTable;
export type VisibilityValue<Name extends VisibilityPropName> = Name extends VisibilityPropName
  ? (typeof visibilityTable)[Name] extends HiddenAtAWidth
    ? Breakpoint
    : boolean
  : never;
type Groups = typeof variableTable;
export type VariableGroup = keyof Groups;
export type VariablesOf<Group extends VariableGroup> = keyof Groups[Group] & string;
export type VariableName = { [Group in VariableGroup]: VariablesOf<Group> }[VariableGroup];
export type VariableRowOf<Name extends VariableName> = {
  [Group in VariableGroup]: Name extends keyof Groups[Group] ? Groups[Group][Name] : never;
}[VariableGroup];
type DisplayStylePropName = {
  [Name in StylePropName]: RowOf<Name> extends { property: "display" } ? Name : never;
}[StylePropName];

function isStylePropName(name: string): name is StylePropName {
  return Object.hasOwn(stylePropTable, name);
}

function isCanonical(name: StylePropName): name is CanonicalStylePropName {
  return !("aliasOf" in stylePropTable[name]);
}

export function isBreakpoint(name: string): name is Breakpoint {
  return Object.hasOwn(breakpointWidths, name);
}

function isVisibilityPropName(name: string): name is VisibilityPropName {
  return Object.hasOwn(visibilityTable, name);
}

const variableRows: Record<string, VariableRow> = Object.assign(
  {},
  ...Object.values(variableTable),
);

function isVariableName(name: string): name is VariableName {
  return Object.hasOwn(variableRows, name);
}

export const stylePropNames = Object.keys(stylePropTable).filter(isStylePropName);
export const canonicalStylePropNames = stylePropNames.filter(isCanonical);
export const breakpoints = Object.keys(breakpointWidths).filter(isBreakpoint);
export const responsiveKeys: ResponsiveKey[] = [baseKey, ...breakpoints];
export const visibilityPropNames = Object.keys(visibilityTable).filter(isVisibilityPropName);
export const variableGroups = Object.keys(variableTable).filter(isVariableGroup);
export const variableNames = Object.keys(variableRows).filter(isVariableName);

export function variablesOf(group: VariableGroup): VariableName[] {
  return Object.keys(variableTable[group]).filter(isVariableName);
}

export function isVariableGroup(name: string): name is VariableGroup {
  return Object.hasOwn(variableTable, name);
}

export function variableRow(name: VariableName): VariableRow {
  return variableRows[name];
}

export function hasChildRules(name: VariableName): boolean {
  return variableRow(name).children !== undefined;
}

export function variableProperty(name: VariableName): `--${string}` {
  return `--${name}`;
}

export function canonicalOf(name: StylePropName): CanonicalStylePropName {
  if (isCanonical(name)) return name;
  return stylePropTable[name].aliasOf;
}

function setsDisplay(name: StylePropName): name is DisplayStylePropName {
  return stylePropTable[canonicalOf(name)].property === "display";
}

export const displayPropNames = [...stylePropNames.filter(setsDisplay), ...visibilityPropNames];

export type DisplayPropName = (typeof displayPropNames)[number];

export const stylePropKeys = [...stylePropNames, ...visibilityPropNames];

function shorthandDepth(name: CanonicalStylePropName): number {
  const row = stylePropTable[name];
  return "within" in row ? 1 + shorthandDepth(row.within) : 0;
}

function responsiveClass(name: string, key: ResponsiveKey): string {
  return key === baseKey
    ? `${stylePropClassPrefix}-${name}`
    : `${stylePropClassPrefix}-${name}-${key}`;
}

export function stylePropClass(name: CanonicalStylePropName, key: ResponsiveKey): string {
  return responsiveClass(name, key);
}

export function variableClass(name: VariableName, key: ResponsiveKey): string {
  return responsiveClass(name, key);
}

export function containerVariableClass(name: VariableName, scope: string, slot: number): string {
  return `${responsiveClass(name, baseKey)}-c${scope}-${slot}`;
}

function visibilityClassesOf(name: VisibilityPropName): Map<unknown, string> {
  const row: HiddenAtAWidth | HiddenInAScheme = visibilityTable[name];
  const className = `${stylePropClassPrefix}-${row.className}`;
  return new Map<unknown, string>(
    "query" in row
      ? breakpoints.map((breakpoint) => [breakpoint, `${className}-${breakpoint}`])
      : [[true, className]],
  );
}

export function visibilityClass(
  name: VisibilityPropName,
  given: VisibilityValue<VisibilityPropName> | null | undefined,
): string | undefined {
  return visibilityClassesOf(name).get(given);
}

export const visibilityClasses = visibilityPropNames.flatMap((name) => [
  ...visibilityClassesOf(name).values(),
]);

export const hiddenInAScheme = visibilityPropNames.flatMap((name) => {
  const row: HiddenAtAWidth | HiddenInAScheme = visibilityTable[name];
  const className = `${stylePropClassPrefix}-${row.className}`;
  return "scheme" in row ? [{ scheme: row.scheme, className, property: `--${className}` }] : [];
});

function media(query: string, rules: string[]): string {
  return `@media ${query}{\n${rules.join("\n")}\n}`;
}

export function registrationRule(className: string): string {
  return `@property --${className}{syntax:"*";inherits:false}`;
}

export function readerRule(className: string, property: string): string {
  return `.${className}{${property}:var(--${className})}`;
}

type Reader = { name: string; property: string; responsive: boolean; depth: number };

const readers: Reader[] = [
  ...canonicalStylePropNames.map((name) => ({
    name,
    property: stylePropTable[name].property,
    responsive: true,
    depth: shorthandDepth(name),
  })),
  ...variableNames.map((name) => ({
    name,
    property: variableProperty(name),
    responsive: variableRow(name).responsive,
    depth: 0,
  })),
];

function keysOf({ responsive }: Reader): ResponsiveKey[] {
  return responsive ? responsiveKeys : [baseKey];
}

function readersAtEveryBreakpoint(group: Reader[]): string[] {
  const read = (key: ResponsiveKey) => (reader: Reader) =>
    readerRule(responsiveClass(reader.name, key), reader.property);
  const responsive = group.filter((reader) => reader.responsive);
  return [
    ...group.map(read(baseKey)),
    ...(responsive.length === 0
      ? []
      : breakpoints.map((breakpoint) =>
          media(`(min-width: ${breakpointWidths[breakpoint]})`, responsive.map(read(breakpoint))),
        )),
  ];
}

function childRules(): string[] {
  return variableNames.flatMap((name) =>
    (variableRow(name).children ?? []).map(({ when = "", path, set }) => {
      const declarations = Object.entries(set(`var(${variableProperty(name)})`))
        .map(([property, value]) => `${property}:${value}`)
        .join(";");
      return `.${variableClass(name, baseKey)}${when}>${path.join(">")}{${declarations}}`;
    }),
  );
}

const outerLayers = [behaviourSdkLayer, libraryCascadeLayer] as const;
export const libraryLayers = [
  componentLayer,
  stylePropLayer,
  colorSchemeLayer,
  containerQueryLayer,
  hiddenLayer,
] as const;
export const outerLayerOrder = `@layer ${outerLayers.join(", ")};`;
export const libraryLayerOrder = `@layer ${libraryLayers.join(", ")};`;
export const layerOrder = `${outerLayerOrder}@layer ${libraryCascadeLayer}{${libraryLayerOrder}}`;

export function stylePropRules(): string {
  const depths = [...new Set(readers.map(({ depth }) => depth))].sort(
    (shallower, deeper) => shallower - deeper,
  );
  const registrations = readers.flatMap((reader) =>
    keysOf(reader).map((key) => registrationRule(responsiveClass(reader.name, key))),
  );
  const ordered = depths.flatMap((depth) =>
    readersAtEveryBreakpoint(readers.filter((reader) => reader.depth === depth)),
  );
  const visibility = visibilityPropNames.flatMap((name) => {
    const row: HiddenAtAWidth | HiddenInAScheme = visibilityTable[name];
    return "query" in row
      ? breakpoints.map((breakpoint) =>
          media(row.query(breakpointWidths[breakpoint]), [
            `.${visibilityClassesOf(name).get(breakpoint)}{display:none}`,
          ]),
        )
      : [];
  });
  return [
    `@layer ${childRuleLayer}{\n${childRules().join("\n")}\n}`,
    ...registrations,
    ...ordered,
    ...visibility,
  ].join("\n");
}

type ColourToken = Extract<keyof typeof tokens, `--solix-color-${string}`>;
type PaletteToken<Palette extends string> = Extract<
  ColourToken,
  `--solix-color-${Palette}-${string}`
>;

export const defaultPalette = "primary";
export const contrastShade = "contrast";

export type Shade =
  PaletteToken<typeof defaultPalette> extends `--solix-color-${typeof defaultPalette}-${infer Key}`
    ? Key
    : never;
type PaletteOf<Token> = Token extends `--solix-color-${infer Name}-${typeof contrastShade}`
  ? Name
  : never;
export type Palette = PaletteOf<ColourToken>;
type VariantSlot = Extract<keyof typeof variantColors, `--${string}`>;
type SlotValue = Shade | "transparent" | Exclude<ColourToken, PaletteToken<Palette>>;

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

export const colorLayer = "colors";
export const variantAttribute = "data-variant";
export const colorClass = `${stylePropClassPrefix}-color`;
export const colorProperty = `--${colorClass}`;
export const shadeClass = `${colorClass}-shade`;
export const customColorClass = `${colorClass}-custom`;
export const fixedContrastClass = `${colorClass}-fixed`;
export const textWithoutContrast = "white";
export const contrastLuminance = Math.sqrt(1.05 * 0.05) - 0.05;

const solidShade = "6" satisfies Shade;
const hoverShade = "7" satisfies Shade;
const pageText = "--solix-color-text" satisfies ColourToken;
const pageBody = "--solix-color-body" satisfies ColourToken;
const derivedShades: Readonly<Partial<Record<Shade, readonly [percent: number, toward: string]>>> =
  {
    "0": [8, "transparent"],
    "1": [15, "transparent"],
    "2": [20, "transparent"],
    "3": [35, `var(${pageBody})`],
    "4": [50, `var(${pageBody})`],
    "5": [75, `var(${pageBody})`],
    "8": [55, `var(${pageText})`],
    "9": [70, `var(${pageText})`],
  };

export function paletteClass(palette: string): string {
  return `${colorClass}-${palette}`;
}

export function paletteToken(palette: string, shade: string): string {
  return `--solix-color-${palette}-${shade}`;
}

function shadeProperty(shade: string): string {
  return `--${stylePropClassPrefix}-shade-${shade}`;
}

export function palettesIn(names: readonly string[]): { palettes: string[]; shades: string[] } {
  const shadePrefix = paletteToken(defaultPalette, "");
  const shades = names.flatMap((name) =>
    name.startsWith(shadePrefix) ? [name.slice(shadePrefix.length)] : [],
  );
  const palettes = names.flatMap((name) => {
    const found = /^--solix-color-(.+)-[^-]+$/.exec(name)?.[1];
    return found !== undefined &&
      paletteToken(found, shades[0]) === name &&
      shades.every((shade) => names.includes(paletteToken(found, shade)))
      ? [found]
      : [];
  });
  return { palettes, shades };
}

export function contrastingText(colour: string): string {
  const channel = `clamp(0, (${contrastLuminance} - (0.2126 * r + 0.7152 * g + 0.0722 * b)) * 1000000, 1)`;
  return `color(from ${colour} srgb-linear ${channel} ${channel} ${channel})`;
}

function mixed(colour: string, percent: number, toward: string): string {
  return `color-mix(in oklab, ${colour} ${percent}%, ${toward})`;
}

function slotValue(value: SlotValue): string {
  if (value === "transparent") return value;
  return value.startsWith("--") ? `var(${value})` : `var(${shadeProperty(value)})`;
}

function declared(declarations: Readonly<Record<string, string>>): string {
  return Object.entries(declarations)
    .map(([property, value]) => `${property}:${value}`)
    .join(";");
}

export function colorRules(colourTokens: readonly string[]): string {
  const { palettes, shades } = palettesIn(colourTokens);
  const given = `var(${colorProperty})`;
  const contrast = `var(${shadeProperty(contrastShade)})`;
  const rules = [
    ...palettes.map(
      (palette) =>
        `.${paletteClass(palette)}{${declared(
          Object.fromEntries(
            shades.map((shade) => [shadeProperty(shade), `var(${paletteToken(palette, shade)})`]),
          ),
        )}}`,
    ),
    `.${shadeClass}{${declared({
      [shadeProperty(solidShade)]: given,
      [shadeProperty(hoverShade)]: mixed(given, 90, contrast),
      [shadeProperty(contrastShade)]: contrastingText(given),
    })}}`,
    `.${customColorClass}{${declared(
      Object.fromEntries(
        Object.entries(derivedShades).map(([shade, [percent, toward]]) => [
          shadeProperty(shade),
          mixed(given, percent, toward),
        ]),
      ),
    )}}`,
    `.${fixedContrastClass}{${shadeProperty(contrastShade)}:${textWithoutContrast}}`,
    ...Object.entries(colorVariantTable).map(
      ([variant, slots]) =>
        `.${colorClass}[${variantAttribute}="${variant}"]{${declared(
          Object.fromEntries(
            Object.entries(slots).map(([slot, value]) => [slot, slotValue(value)]),
          ),
        )}}`,
    ),
  ];
  return `@layer ${colorLayer}{\n${rules.join("\n")}\n}`;
}
