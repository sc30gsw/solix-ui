import type { JSX } from "@solidjs/web";

export type Scale = "spacing" | "font-size" | "line-height" | "radius" | "color" | "container-size";

export type PropertyRow = {
  readonly property: keyof JSX.CSSProperties;
  readonly kind: "length" | "raw";
  readonly scale?: Scale;
  readonly within?: string;
};

type AliasRow = { readonly aliasOf: string };

type ChildRule = readonly [selector: string, declarations: string];

/** A custom property, or a property, that a component sets on its root from one of its own props. */
export type VariableRow = {
  readonly kind: "length" | "raw";
  readonly scale?: Scale;
  readonly responsive: boolean;
  readonly property?: keyof JSX.CSSProperties;
  readonly within?: string;
  readonly children?: readonly ChildRule[];
};

export const stylePropClassPrefix = "sx";
export const libraryCascadeLayer = "solix";
export const stylePropLayer = "style-props";
export const childRuleLayer = "child-rules";

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
  Container: {
    "container-size": {
      kind: "length",
      scale: "container-size",
      responsive: false,
      children: [
        ['[data-strategy="grid"] > *', "grid-column:2"],
        ['[data-strategy="grid"] > [data-breakout]', "grid-column:1/-1"],
        [
          '[data-strategy="grid"] > [data-breakout] > [data-container]',
          "max-width:var(--container-size);margin-inline:auto",
        ],
      ],
    },
  },
  Flex: {
    "flex-align": { kind: "raw", responsive: true, property: "align-items" },
    "flex-column-gap": {
      kind: "length",
      scale: "spacing",
      responsive: true,
      property: "column-gap",
      within: "flex-gap",
    },
    "flex-direction": { kind: "raw", responsive: true, property: "flex-direction" },
    "flex-gap": { kind: "length", scale: "spacing", responsive: true, property: "gap" },
    "flex-justify": { kind: "raw", responsive: true, property: "justify-content" },
    "flex-row-gap": {
      kind: "length",
      scale: "spacing",
      responsive: true,
      property: "row-gap",
      within: "flex-gap",
    },
    "flex-wrap": { kind: "raw", responsive: true, property: "flex-wrap" },
  },
  Group: {
    "group-align": { kind: "raw", responsive: false },
    "group-child-width": {
      kind: "raw",
      responsive: false,
      children: [[" > *", "flex-grow:1;max-width:var(--group-child-width)"]],
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
    "space-min-width": { kind: "length", scale: "spacing", responsive: true },
    "space-min-height": { kind: "length", scale: "spacing", responsive: true },
  },
  Stack: {
    "stack-align": { kind: "raw", responsive: false },
    "stack-gap": { kind: "length", scale: "spacing", responsive: false },
    "stack-justify": { kind: "raw", responsive: false },
  },
} as const satisfies Record<string, Record<string, VariableRow>>;

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
type Groups = typeof variableTable;
export type VariableGroup = keyof Groups;
export type VariableName = {
  [Group in VariableGroup]: keyof Groups[Group] & string;
}[VariableGroup];
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

function isBreakpoint(name: string): name is Breakpoint {
  return Object.hasOwn(breakpointWidths, name);
}

function isVisibilityPropName(name: string): name is VisibilityPropName {
  return Object.hasOwn(visibilityTable, name);
}

function isVariableGroup(name: string): name is VariableGroup {
  return Object.hasOwn(variableTable, name);
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

export function variableRow(name: VariableName): VariableRow {
  return variableRows[name];
}

export function variableProperty(name: VariableName): string {
  return variableRow(name).property ?? `--${name}`;
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

export function variableDepth(name: string): number {
  const within = variableRows[name]?.within;
  return within === undefined ? 0 : 1 + variableDepth(within);
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

export function visibilityClass(name: VisibilityPropName, breakpoint: Breakpoint): string {
  return `${stylePropClassPrefix}-${visibilityTable[name].className}-${breakpoint}`;
}

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
    depth: variableDepth(name),
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
    (variableRow(name).children ?? []).map(
      ([selector, declarations]) =>
        `.${responsiveClass(name, baseKey)}${selector}{${declarations}}`,
    ),
  );
}

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
  const visibility = visibilityPropNames.flatMap((name) =>
    breakpoints.map((breakpoint) =>
      media(visibilityTable[name].query(breakpointWidths[breakpoint]), [
        `.${visibilityClass(name, breakpoint)}{display:none}`,
      ]),
    ),
  );
  return [
    `@layer ${childRuleLayer}{\n${childRules().join("\n")}\n}`,
    ...registrations,
    ...ordered,
    ...visibility,
  ].join("\n");
}
