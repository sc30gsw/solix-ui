import type { JSX } from "@solidjs/web";

export type Scale = "spacing" | "font-size" | "line-height" | "radius" | "color";

export type PropertyRow = {
  readonly property: keyof JSX.CSSProperties;
  readonly kind: "length" | "raw";
  readonly scale?: Scale;
  readonly within?: string;
};

type AliasRow = { readonly aliasOf: string };

export const stylePropClassPrefix = "sx";

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

const visibilityTable = {
  hiddenFrom: { className: "hidden-from", query: (width: string) => `(min-width: ${width})` },
  visibleFrom: { className: "visible-from", query: (width: string) => `(width < ${width})` },
} satisfies Record<string, { className: string; query: (width: string) => string }>;

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
type DisplayStylePropName = {
  [Name in StylePropName]: RowOf<Name> extends { property: "display" } ? Name : never;
}[StylePropName];

function isStylePropName(name: string): name is StylePropName {
  return Object.hasOwn(stylePropTable, name);
}

function isCanonical(name: StylePropName): name is CanonicalStylePropName {
  return !("aliasOf" in stylePropTable[name]);
}

function isBreakpoint(name: string): name is Breakpoint {
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

export function stylePropClass(name: CanonicalStylePropName, key: ResponsiveKey): string {
  return key === baseKey
    ? `${stylePropClassPrefix}-${name}`
    : `${stylePropClassPrefix}-${name}-${key}`;
}

export function visibilityClass(name: VisibilityPropName, breakpoint: Breakpoint): string {
  return `${stylePropClassPrefix}-${visibilityTable[name].className}-${breakpoint}`;
}

function media(query: string, rules: string[]): string {
  return `@media ${query}{\n${rules.join("\n")}\n}`;
}

function registration(name: CanonicalStylePropName, key: ResponsiveKey): string {
  return `@property --${stylePropClass(name, key)}{syntax:"*";inherits:false}`;
}

function reader(name: CanonicalStylePropName, key: ResponsiveKey): string {
  const className = stylePropClass(name, key);
  return `.${className}{${stylePropTable[name].property}:var(--${className})}`;
}

function readersAtEveryBreakpoint(names: CanonicalStylePropName[]): string[] {
  return [
    ...names.map((name) => reader(name, baseKey)),
    ...breakpoints.map((breakpoint) =>
      media(
        `(min-width: ${breakpointWidths[breakpoint]})`,
        names.map((name) => reader(name, breakpoint)),
      ),
    ),
  ];
}

export function stylePropRules(): string {
  const depths = [...new Set(canonicalStylePropNames.map(shorthandDepth))].sort(
    (shallower, deeper) => shallower - deeper,
  );
  const registrations = canonicalStylePropNames.flatMap((name) =>
    responsiveKeys.map((key) => registration(name, key)),
  );
  const readers = depths.flatMap((depth) =>
    readersAtEveryBreakpoint(
      canonicalStylePropNames.filter((name) => shorthandDepth(name) === depth),
    ),
  );
  const visibility = visibilityPropNames.flatMap((name) =>
    breakpoints.map((breakpoint) =>
      media(visibilityTable[name].query(breakpointWidths[breakpoint]), [
        `.${visibilityClass(name, breakpoint)}{display:none}`,
      ]),
    ),
  );
  return [...registrations, ...readers, ...visibility].join("\n");
}
