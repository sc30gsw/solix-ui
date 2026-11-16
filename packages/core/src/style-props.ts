import type { JSX } from "@solidjs/web";
import {
  baseKey,
  type Breakpoint,
  breakpoints,
  canonicalOf,
  libraryCascadeLayer,
  type PropertyRow,
  readerRule,
  registrationRule,
  type ResponsiveKey,
  type RowOf,
  type Scale,
  stylePropClass,
  stylePropClassPrefix,
  stylePropLayer,
  type StylePropName,
  stylePropNames,
  stylePropTable,
  variableClass,
  variableDepth,
  type VariableName,
  variableNames,
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
const containerWidth = /^(\d*\.?\d+)(px|em|rem)$/;
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
export type ContainerWidth = `${number}${"px" | "em" | "rem"}`;

/** A value for every width, or one for each breakpoint or container width it applies from. */
export type ResponsiveProp<V> =
  | V
  | Absent
  | { [Key in ResponsiveKey | ContainerWidth]?: V | Absent };

export type Variables = {
  [Name in VariableName]?: VariableRowOf<Name>["responsive"] extends true
    ? ResponsiveProp<string | number>
    : string | number | Absent;
};

/** The container widths, in ascending order, that the values given to `variables` are keyed by. */
export type ContainerQueries = {
  readonly scope: string;
  readonly widths: readonly (readonly [key: string, width: string])[];
};

export type StyleProps = {
  [Name in StylePropName]?: StyleProp<ValueOf<RowOf<Name>>>;
} & { [Name in VisibilityPropName]?: Breakpoint | Absent };

export type ResolvedStyleProps = {
  classes: string[];
  properties: Record<`--${string}`, string>;
};

function keyedEntries<Key extends string>(
  value: ResponsiveProp<string | number>,
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

function containerClass(name: VariableName, queries: ContainerQueries, slot: number): string {
  return `${stylePropClassPrefix}-${name}-c${queries.scope}-${slot}`;
}

function placed(
  name: VariableName,
  value: ResponsiveProp<string | number>,
  queries: ContainerQueries | undefined,
): [className: string, written: string | number][] {
  if (!variableRow(name).responsive) {
    return keyedEntries(value, []).map(([, written]) => [variableClass(name, baseKey), written]);
  }
  if (queries === undefined) {
    return keyedEntries(value, breakpoints).map(([key, written]) => [
      variableClass(name, key),
      written,
    ]);
  }
  const slots = queries.widths.map(([key]) => key);
  return keyedEntries(value, slots).map(([key, written]) => [
    key === baseKey
      ? variableClass(name, baseKey)
      : containerClass(name, queries, slots.indexOf(key)),
    written,
  ]);
}

/**
 * The classes and custom properties that give a component's root the values of its own
 * variables. A keyed value applies from each breakpoint it names, or, given `queries`, from each
 * container width it names, whose rules `containerRules` writes.
 */
export function variables(given: Variables, queries?: ContainerQueries): ResolvedStyleProps {
  const classes: string[] = [];
  const properties: Record<`--${string}`, string> = {};
  for (const name of variableNames) {
    for (const [className, written] of placed(name, given[name], queries)) {
      const value = cssValue(variableRow(name), written);
      if (value === undefined) continue;
      classes.push(className);
      properties[`--${className}`] = value;
    }
  }
  return { classes, properties };
}

/** The keys of a value that are container widths. */
export function containerWidthsOf(value: ResponsiveProp<unknown>): ContainerWidth[] {
  if (value === undefined || value === null || typeof value !== "object") return [];
  return Object.keys(value).filter((key): key is ContainerWidth => containerWidth.test(key));
}

function pixelsOf(width: string): number {
  const [, amount = "0", unit] = containerWidth.exec(width) ?? [];
  return Number(amount) * (unit === "px" ? 1 : pixelsPerRem);
}

/**
 * The container widths a component queries, valid lengths only and in ascending order, under a
 * scope that keeps its classes apart from every other instance's.
 */
export function containerQueries(
  scope: string,
  widths: readonly (readonly [key: string, width: string])[],
): ContainerQueries {
  return {
    scope: scope.replace(characterOutsideAClassName, "_"),
    widths: widths
      .filter(([, width]) => containerWidth.test(width))
      .toSorted(([, narrower], [, wider]) => pixelsOf(narrower) - pixelsOf(wider)),
  };
}

/**
 * The rules that apply, inside the container named `container`, the values `variables` placed
 * for `queries`. Its text holds only class names, property names and validated widths.
 */
export function containerRules(
  queries: ContainerQueries,
  container: string,
  names: readonly VariableName[],
): string {
  const responsive = names.filter((name) => variableRow(name).responsive);
  const depths = [...new Set(responsive.map(variableDepth))].sort(
    (shallower, deeper) => shallower - deeper,
  );
  const registrations = queries.widths.flatMap((_, slot) =>
    responsive.map((name) => registrationRule(containerClass(name, queries, slot))),
  );
  const readers = depths.flatMap((depth) =>
    queries.widths.map(
      ([, width], slot) =>
        `@container ${container} (min-width: ${width}){${responsive
          .filter((name) => variableDepth(name) === depth)
          .map((name) => readerRule(containerClass(name, queries, slot), variableProperty(name)))
          .join("")}}`,
    ),
  );
  return `@layer ${libraryCascadeLayer}.${stylePropLayer}{${[...registrations, ...readers].join("")}}`;
}
