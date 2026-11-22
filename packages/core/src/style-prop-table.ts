import type { JSX } from "@solidjs/web";
import type { SolixComputedColorScheme } from "#/src/computed-color-scheme.ts";
import { childRuleLayer } from "#/src/layers.ts";
import type { VariableRow, Variables } from "#/src/variables.ts";

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

export const stylePropClassPrefix = "sx";
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
export type StylePropRows = Rows;
export type VisibilityRows = typeof visibilityTable;
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
export type VisibilityPropName = keyof VisibilityRows;
export type VisibilityValue<Name extends VisibilityPropName> = Name extends VisibilityPropName
  ? VisibilityRows[Name] extends HiddenAtAWidth
    ? Breakpoint
    : boolean
  : never;
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

export const stylePropNames = Object.keys(stylePropTable).filter(isStylePropName);
export const canonicalStylePropNames = stylePropNames.filter(isCanonical);
export const breakpoints = Object.keys(breakpointWidths).filter(isBreakpoint);
export const responsiveKeys: ResponsiveKey[] = [baseKey, ...breakpoints];
export const visibilityPropNames = Object.keys(visibilityTable).filter(isVisibilityPropName);
export function variableProperty(name: string): `--${string}` {
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

export function variableClass(name: string, key: ResponsiveKey): string {
  return responsiveClass(name, key);
}

export function containerVariableClass(name: string, scope: string, slot: number): string {
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

function rowsOf(variables: readonly Variables[]): [name: string, row: VariableRow][] {
  return variables.flatMap(({ rows }) => Object.entries(rows));
}

function readersOf(variables: readonly Variables[]): Reader[] {
  return [
    ...canonicalStylePropNames.map((name) => ({
      name,
      property: stylePropTable[name].property,
      responsive: true,
      depth: shorthandDepth(name),
    })),
    ...rowsOf(variables).map(([name, row]) => ({
      name,
      property: variableProperty(name),
      responsive: row.responsive,
      depth: 0,
    })),
  ];
}

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

function childRules(variables: readonly Variables[]): string[] {
  return rowsOf(variables).flatMap(([name, row]) =>
    (row.children ?? []).map(({ when = "", path, set }) => {
      const declarations = Object.entries(set(`var(${variableProperty(name)})`))
        .map(([property, value]) => `${property}:${value}`)
        .join(";");
      return `.${variableClass(name, baseKey)}${when}>${path.join(">")}{${declarations}}`;
    }),
  );
}

export function stylePropRules(variables: readonly Variables[]): string {
  const readers = readersOf(variables);
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
    `@layer ${childRuleLayer}{\n${childRules(variables).join("\n")}\n}`,
    ...registrations,
    ...ordered,
    ...visibility,
  ].join("\n");
}
