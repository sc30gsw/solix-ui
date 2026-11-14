import type { JSX } from "@solidjs/web";
import type { tokens } from "./tokens.stylex";

type Scale = "spacing" | "font-size" | "line-height" | "radius" | "color";

type StylePropRow = {
  property: keyof JSX.CSSProperties;
  kind: "length" | "raw";
  scale?: Scale;
};

export const stylePropTable = {
  m: { property: "margin", kind: "length", scale: "spacing" },
  mx: { property: "margin-inline", kind: "length", scale: "spacing" },
  my: { property: "margin-block", kind: "length", scale: "spacing" },
  mt: { property: "margin-top", kind: "length", scale: "spacing" },
  mb: { property: "margin-bottom", kind: "length", scale: "spacing" },
  ml: { property: "margin-left", kind: "length", scale: "spacing" },
  mr: { property: "margin-right", kind: "length", scale: "spacing" },
  ms: { property: "margin-inline-start", kind: "length", scale: "spacing" },
  me: { property: "margin-inline-end", kind: "length", scale: "spacing" },
  mis: { property: "margin-inline-start", kind: "length", scale: "spacing" },
  mie: { property: "margin-inline-end", kind: "length", scale: "spacing" },
  p: { property: "padding", kind: "length", scale: "spacing" },
  px: { property: "padding-inline", kind: "length", scale: "spacing" },
  py: { property: "padding-block", kind: "length", scale: "spacing" },
  pt: { property: "padding-top", kind: "length", scale: "spacing" },
  pb: { property: "padding-bottom", kind: "length", scale: "spacing" },
  pl: { property: "padding-left", kind: "length", scale: "spacing" },
  pr: { property: "padding-right", kind: "length", scale: "spacing" },
  ps: { property: "padding-inline-start", kind: "length", scale: "spacing" },
  pe: { property: "padding-inline-end", kind: "length", scale: "spacing" },
  pis: { property: "padding-inline-start", kind: "length", scale: "spacing" },
  pie: { property: "padding-inline-end", kind: "length", scale: "spacing" },
  w: { property: "width", kind: "length", scale: "spacing" },
  miw: { property: "min-width", kind: "length", scale: "spacing" },
  maw: { property: "max-width", kind: "length", scale: "spacing" },
  h: { property: "height", kind: "length", scale: "spacing" },
  mih: { property: "min-height", kind: "length", scale: "spacing" },
  mah: { property: "max-height", kind: "length", scale: "spacing" },
  c: { property: "color", kind: "raw", scale: "color" },
  bg: { property: "background", kind: "raw", scale: "color" },
  bgsz: { property: "background-size", kind: "length" },
  bgp: { property: "background-position", kind: "raw" },
  bgr: { property: "background-repeat", kind: "raw" },
  bga: { property: "background-attachment", kind: "raw" },
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
  top: { property: "top", kind: "length" },
  left: { property: "left", kind: "length" },
  bottom: { property: "bottom", kind: "length" },
  right: { property: "right", kind: "length" },
  display: { property: "display", kind: "raw" },
  flex: { property: "flex", kind: "raw" },
} satisfies Record<string, StylePropRow>;

const breakpointWidths = {
  xs: "36em",
  sm: "48em",
  md: "62em",
  lg: "75em",
  xl: "88em",
} satisfies Record<string, string>;

const visibilityTable = {
  hiddenFrom: { className: "hidden-from", query: (width: string) => `(min-width: ${width})` },
  visibleFrom: { className: "visible-from", query: (width: string) => `(width < ${width})` },
} satisfies Record<string, { className: string; query: (width: string) => string }>;

const classPrefix = "sx";
const baseKey = "base";
const pixelsPerRem = 16;

export type StylePropName = keyof typeof stylePropTable;
export type Breakpoint = keyof typeof breakpointWidths;
type VisibilityPropName = keyof typeof visibilityTable;
export type StyleProp<V> = V | { [Key in typeof baseKey | Breakpoint]?: V };

type TokenKey<Name, Of extends Scale> = Name extends `--solix-${Of}-${infer Key}` ? Key : never;
type ScaleKey<Of extends Scale> = TokenKey<Extract<keyof typeof tokens, string>, Of>;
type ValueOf<Row extends StylePropRow> =
  | NonNullable<JSX.CSSProperties[Row["property"]]>
  | (Row["kind"] extends "length" ? number : never)
  | (Row extends { scale: infer Of extends Scale } ? ScaleKey<Of> : never);

export type StyleProps = {
  [Name in StylePropName]?: StyleProp<ValueOf<(typeof stylePropTable)[Name]>>;
} & { [Name in VisibilityPropName]?: Breakpoint };

type ResolvedStyleProps = {
  classes: string[];
  style: Record<`--${string}`, string>;
};

function isStylePropName(name: string): name is StylePropName {
  return Object.hasOwn(stylePropTable, name);
}

function isBreakpoint(name: string): name is Breakpoint {
  return Object.hasOwn(breakpointWidths, name);
}

function isVisibilityPropName(name: string): name is VisibilityPropName {
  return Object.hasOwn(visibilityTable, name);
}

export const stylePropNames = Object.keys(stylePropTable).filter(isStylePropName);
export const breakpoints = Object.keys(breakpointWidths).filter(isBreakpoint);
export const visibilityPropNames = Object.keys(visibilityTable).filter(isVisibilityPropName);

const responsiveKeys: (typeof baseKey | Breakpoint)[] = [baseKey, ...breakpoints];

function responsiveEntries(value: StyleProp<string | number>): [string, string | number][] {
  if (typeof value !== "object") return [[baseKey, value]];
  return responsiveKeys.flatMap((key): [string, string | number][] => {
    const written = value[key];
    return written === undefined ? [] : [[key, written]];
  });
}

function cssValue(row: StylePropRow, written: string | number, tokens: object): string {
  const token = row.scale === undefined ? undefined : `--solix-${row.scale}-${written}`;
  if (token !== undefined && Object.hasOwn(tokens, token)) return `var(${token})`;
  if (row.kind === "length" && typeof written === "number") {
    return `${written / pixelsPerRem}rem`;
  }
  return String(written);
}

function suffixed(name: string, key: string): string {
  return key === baseKey ? name : `${name}-${key}`;
}

export function resolveStyleProps(props: StyleProps, tokens: object): ResolvedStyleProps {
  const classes: string[] = [];
  const style: Record<`--${string}`, string> = {};
  for (const name of stylePropNames) {
    const value = props[name];
    if (value === undefined) continue;
    for (const [key, written] of responsiveEntries(value)) {
      const suffix = suffixed(name, key);
      classes.push(`${classPrefix}-${suffix}`);
      style[`--${classPrefix}-${suffix}`] = cssValue(stylePropTable[name], written, tokens);
    }
  }
  for (const name of visibilityPropNames) {
    const breakpoint = props[name];
    if (breakpoint !== undefined) {
      classes.push(`${classPrefix}-${visibilityTable[name].className}-${breakpoint}`);
    }
  }
  return { classes, style };
}

function rule(className: string, declaration: string): string {
  return `.${classPrefix}-${className}{${declaration}}`;
}

function media(query: string, rules: string[]): string {
  return `@media ${query}{\n${rules.join("\n")}\n}`;
}

export function stylePropRules(): string {
  const declarationFor = (name: StylePropName, key: string) =>
    rule(
      suffixed(name, key),
      `${stylePropTable[name].property}:var(--${classPrefix}-${suffixed(name, key)})`,
    );
  const base = stylePropNames.map((name) => declarationFor(name, baseKey));
  const responsive = breakpoints.map((breakpoint) =>
    media(
      `(min-width: ${breakpointWidths[breakpoint]})`,
      stylePropNames.map((name) => declarationFor(name, breakpoint)),
    ),
  );
  const visibility = visibilityPropNames.flatMap((name) =>
    breakpoints.map((breakpoint) =>
      media(visibilityTable[name].query(breakpointWidths[breakpoint]), [
        rule(`${visibilityTable[name].className}-${breakpoint}`, "display:none"),
      ]),
    ),
  );
  return [...base, ...responsive, ...visibility].join("\n");
}
