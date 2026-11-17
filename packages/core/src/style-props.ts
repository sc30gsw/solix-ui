import type { JSX } from "@solidjs/web";
import {
  baseKey,
  type Breakpoint,
  breakpointWidths,
  breakpoints,
  canonicalOf,
  containerVariableClass,
  isBreakpoint,
  layerOrder,
  libraryCascadeLayer,
  type PropertyRow,
  readerRule,
  registrationRule,
  type ResponsiveKey,
  type RowOf,
  type Scale,
  stylePropClass,
  containerQueryLayer,
  type StylePropName,
  stylePropNames,
  stylePropTable,
  variableClass,
  type VariableGroup,
  type VariableName,
  variablesOf,
  variableProperty,
  variableRow,
  type VariableRowOf,
  visibilityClass,
  type VisibilityPropName,
  visibilityPropNames,
} from "./style-prop-table";
import { tokens } from "./tokens.stylex";

const pixelsPerRem = 16;
const characterThatEndsADeclaration = /[;{}]/;
const containerWidthUnits = ["rem", "px", "em"] as const;
const characterOutsideAClassName = /[^\w-]/g;

type Absent = null | undefined;
type TokenKey<Name, Of extends Scale> = Name extends `--solix-${Of}-${infer Key}` ? Key : never;
type ScaleKey<Of extends Scale> = TokenKey<Extract<keyof typeof tokens, string>, Of>;
type ValueOf<Row> = Row extends PropertyRow
  ?
      | NonNullable<JSX.CSSProperties[Row["property"]]>
      | (Row["kind"] extends "length" ? number : never)
      | (Row extends { scale: infer Of extends Scale } ? ScaleKey<Of> : never)
  : never;

export type StyleProp<V> = V | Absent | { [Key in ResponsiveKey]?: V | Absent };

/** A key of a token scale, a number of pixels written in rem, or any CSS length. */
export type ScaleValue<Of extends Scale> = ScaleKey<Of> | number | (string & {});

export type Spacing = ScaleValue<"spacing">;

/** A container width that a value keyed for container queries applies from, such as `"40em"`. */
export type ContainerWidth = `${number}${(typeof containerWidthUnits)[number]}`;

/**
 * A value for every width, or one for each width of its container it applies from: a container
 * width, or a breakpoint, whose width the library's breakpoints give.
 */
export type ContainerProp<V> =
  | V
  | Absent
  | { [Key in typeof baseKey | Breakpoint | ContainerWidth]?: V | Absent };

type Keyed<V> = V | Absent | Readonly<Record<string, V | Absent>>;

type Row<Name extends VariableName> = VariableRowOf<Name>;

type DefaultValue<Name extends VariableName> =
  Row<Name> extends { kind: "length"; scale: infer Of extends Scale }
    ? ScaleValue<Of>
    : Row<Name> extends { kind: "length" }
      ? number | (string & {})
      : string | number;

/** A prop that sets the variable `Name`, keyed by breakpoint when its row is responsive. */
export type VariableProp<
  Name extends VariableName,
  Value = DefaultValue<Name>,
> = Row<Name>["responsive"] extends true ? StyleProp<Value> : Value | Absent;

/** A prop that sets the responsive variable `Name`, keyed by container width. */
export type ContainerVariableProp<
  Name extends VariableName,
  Value = DefaultValue<Name>,
> = ContainerProp<Value>;

export type VariableValue = Keyed<string | number>;

export type ContainerQueries = {
  readonly scope: string;
  readonly widths: readonly (readonly [key: string, width: string])[];
};

type Used = readonly [name: VariableName, slot: number];

export type QueryContainer = {
  readonly queries: () => ContainerQueries | undefined;
  readonly report: (used: () => readonly Used[]) => void;
  readonly rules: () => string | undefined;
  readonly member: () => QueryContainer;
};

export type ResolvedVariables = ResolvedStyleProps & { readonly used: readonly Used[] };

export type StyleProps = {
  [Name in StylePropName]?: StyleProp<ValueOf<RowOf<Name>>>;
} & { [Name in VisibilityPropName]?: Breakpoint | Absent };

export type ResolvedStyleProps = {
  classes: string[];
  properties: Record<`--${string}`, string>;
};

function keyedEntries<Key extends string>(
  value: VariableValue,
  keys: readonly Key[],
): [typeof baseKey | Key, string | number][] {
  if (value === undefined || value === null) return [];
  if (typeof value !== "object") return [[baseKey, value]];
  const keyed: Partial<Record<string, string | number | Absent>> = value;
  const every: (typeof baseKey | Key)[] = [baseKey, ...keys];
  return every.flatMap((key): [typeof baseKey | Key, string | number][] => {
    const written = keyed[key];
    return written === undefined || written === null ? [] : [[key, written]];
  });
}

function cssValue(
  row: Pick<PropertyRow, "kind" | "scale">,
  written: string | number,
): string | undefined {
  if (typeof written === "number") {
    return row.kind === "length" ? `${written / pixelsPerRem}rem` : String(written);
  }
  if (characterThatEndsADeclaration.test(written)) return undefined;
  const token = `--solix-${row.scale}-${written}`;
  return row.scale !== undefined && Object.hasOwn(tokens, token) ? `var(${token})` : written;
}

function presentEntries(style: JSX.CSSProperties): [string, string | number][] {
  return Object.entries(style).flatMap(([property, value]): [string, string | number][] =>
    value === undefined || value === null ? [] : [[property, value]],
  );
}

function declarations(style: JSX.CSSProperties): string {
  return presentEntries(style)
    .map(([property, value]) => `${property}:${value};`)
    .join("");
}

export function presentStyle(style: JSX.CSSProperties | undefined): JSX.CSSProperties {
  return Object.fromEntries(presentEntries(style ?? {}));
}

export function withConsumerStyle(
  own: JSX.CSSProperties,
  consumer?: JSX.CSSProperties | string,
): JSX.CSSProperties | string | undefined {
  if (typeof consumer === "string") return `${declarations(own)}${consumer}`;
  if (consumer === undefined && Object.keys(own).length === 0) return undefined;
  return { ...own, ...presentStyle(consumer) };
}

export function resolveStyleProps(props: StyleProps): ResolvedStyleProps {
  const classes = new Set<string>();
  const properties: Record<`--${string}`, string> = {};
  for (const name of stylePropNames) {
    const canonical = canonicalOf(name);
    for (const [key, written] of keyedEntries(props[name], breakpoints)) {
      const value = cssValue(stylePropTable[canonical], written);
      if (value === undefined) continue;
      const className = stylePropClass(canonical, key);
      classes.add(className);
      properties[`--${className}`] = value;
    }
  }
  for (const name of visibilityPropNames) {
    const breakpoint = props[name];
    if (breakpoint !== undefined && breakpoint !== null) {
      classes.add(visibilityClass(name, breakpoint));
    }
  }
  return { classes: [...classes], properties };
}

export function eachValue<V extends string | number>(
  value: Keyed<V>,
  write: (given: V) => string | undefined,
): Keyed<string> {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object") return write(value);
  return Object.fromEntries(
    Object.entries(value).map(([key, given]) => [
      key,
      given === undefined || given === null ? given : write(given),
    ]),
  );
}

export function withBase<V extends string | number>(value: Keyed<V>, base: V): Keyed<V> {
  if (value === undefined || value === null) return base;
  if (typeof value !== "object") return value;
  return { ...value, [baseKey]: value[baseKey] ?? base };
}

function placed(
  name: VariableName,
  value: VariableValue,
  queries: ContainerQueries | undefined,
): [className: string, written: string | number, slot: number | undefined][] {
  if (!variableRow(name).responsive) {
    return keyedEntries(value, []).map(([, written]) => [
      variableClass(name, baseKey),
      written,
      undefined,
    ]);
  }
  if (queries === undefined) {
    return keyedEntries(value, breakpoints).map(([key, written]) => [
      variableClass(name, key),
      written,
      undefined,
    ]);
  }
  const slots = queries.widths.map(([key]) => key);
  return keyedEntries(value, slots).map(([key, written]) => {
    if (key === baseKey) return [variableClass(name, baseKey), written, undefined];
    const slot = slots.indexOf(key);
    return [containerVariableClass(name, queries.scope, slot), written, slot];
  });
}

export function resolveVariables(
  group: VariableGroup,
  given: Readonly<Partial<Record<VariableName, VariableValue>>>,
  queries: ContainerQueries | undefined,
  leaveOut: (name: VariableName) => boolean,
): ResolvedVariables {
  const classes: string[] = [];
  const properties: Record<`--${string}`, string> = {};
  const used: Used[] = [];
  for (const name of variablesOf(group)) {
    if (leaveOut(name)) continue;
    for (const [className, written, slot] of placed(name, given[name], queries)) {
      const value = cssValue(variableRow(name), written);
      if (value === undefined) continue;
      classes.push(className);
      properties[`--${className}`] = value;
      if (slot !== undefined) used.push([name, slot]);
    }
  }
  return { classes, properties, used };
}

export function containerKeysOf(value: Keyed<unknown>): [key: string, width: string][] {
  if (value === undefined || value === null || typeof value !== "object") return [];
  return Object.keys(value).flatMap((key): [string, string][] => {
    if (isBreakpoint(key)) return [[key, breakpointWidths[key]]];
    return isContainerWidth(key) ? [[key, key]] : [];
  });
}

function widthOf(written: string): { amount: number; unit: string } | undefined {
  const unit = containerWidthUnits.find((found) => written.endsWith(found));
  const amount = unit === undefined ? "" : written.slice(0, -unit.length);
  return unit !== undefined && amount !== "" && Number.isFinite(Number(amount))
    ? { amount: Number(amount), unit }
    : undefined;
}

export function isContainerWidth(written: string): written is ContainerWidth {
  return widthOf(written) !== undefined;
}

function pixelsOf(width: string): number {
  const { amount = 0, unit = "px" } = widthOf(width) ?? {};
  return amount * (unit === "px" ? 1 : pixelsPerRem);
}

function rulesFor(queries: ContainerQueries, used: readonly Used[]): string | undefined {
  if (used.length === 0) return undefined;
  const registrations = used.map(([name, slot]) =>
    registrationRule(containerVariableClass(name, queries.scope, slot)),
  );
  const readers = queries.widths.flatMap(([, width], slot) => {
    const atSlot = used.filter(([, at]) => at === slot);
    if (atSlot.length === 0) return [];
    const read = atSlot.map(([name]) =>
      readerRule(containerVariableClass(name, queries.scope, slot), variableProperty(name)),
    );
    return [`@container (min-width: ${width}){${read.join("")}}`];
  });
  return `@layer ${libraryCascadeLayer}{${layerOrder}}@layer ${libraryCascadeLayer}.${containerQueryLayer}{${[...registrations, ...readers].join("")}}`;
}

function uniqueUsed(used: readonly Used[]): Used[] {
  const seen = new Map(used.map((pair) => [pair.join(" "), pair]));
  return [...seen.values()].sort(([before, beforeSlot], [after, afterSlot]) =>
    beforeSlot === afterSlot ? before.localeCompare(after) : beforeSlot - afterSlot,
  );
}

function queryContainer(queries: () => ContainerQueries | undefined): QueryContainer {
  let reported: () => readonly Used[] = () => [];
  return {
    queries,
    report(used) {
      reported = used;
    },
    rules() {
      const current = queries();
      return current && rulesFor(current, uniqueUsed(reported()));
    },
    member: () => queryContainer(queries),
  };
}

export function createQueryContainer(
  scope: string,
  widths: () => readonly (readonly [key: string, width: string])[] | undefined,
): QueryContainer {
  return queryContainer(() => {
    const given = widths();
    if (given === undefined) return undefined;
    return {
      scope: scope.replace(characterOutsideAClassName, "_"),
      widths: given
        .flatMap(([key, width]): [string, string][] => {
          const parsed = widthOf(width);
          return parsed ? [[key, `${parsed.amount}${parsed.unit}`]] : [];
        })
        .toSorted(([, narrower], [, wider]) => pixelsOf(narrower) - pixelsOf(wider)),
    };
  });
}
