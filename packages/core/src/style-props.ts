import type { JSX } from "@solidjs/web";
import {
  baseKey,
  type Breakpoint,
  breakpoints,
  canonicalOf,
  type PropertyRow,
  type ResponsiveKey,
  type RowOf,
  type Scale,
  stylePropClass,
  type StylePropName,
  stylePropNames,
  stylePropTable,
  variableClass,
  type VariableName,
  variableNames,
  variableRow,
  type VariableRowOf,
  visibilityClass,
  type VisibilityPropName,
  visibilityPropNames,
} from "./style-prop-table";
import { tokens } from "./tokens.stylex";

const pixelsPerRem = 16;
const characterThatEndsADeclaration = /[;{}]/;

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

export type Variables = {
  [Name in VariableName]?: VariableRowOf<Name>["responsive"] extends true
    ? StyleProp<string | number>
    : string | number | Absent;
};

export type StyleProps = {
  [Name in StylePropName]?: StyleProp<ValueOf<RowOf<Name>>>;
} & { [Name in VisibilityPropName]?: Breakpoint | Absent };

export type ResolvedStyleProps = {
  classes: string[];
  properties: Record<`--${string}`, string>;
};

function keyedEntries<Key extends string>(
  value: StyleProp<string | number>,
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

function placed(
  name: VariableName,
  value: StyleProp<string | number>,
): [className: string, written: string | number][] {
  const keys = variableRow(name).responsive ? breakpoints : [];
  return keyedEntries(value, keys).map(([key, written]) => [variableClass(name, key), written]);
}

/**
 * The classes and custom properties that give a component's root the values of its own
 * variables, a keyed value from each breakpoint it names.
 */
export function variables(given: Variables): ResolvedStyleProps {
  const classes: string[] = [];
  const properties: Record<`--${string}`, string> = {};
  for (const name of variableNames) {
    for (const [className, written] of placed(name, given[name])) {
      const value = cssValue(variableRow(name), written);
      if (value === undefined) continue;
      classes.push(className);
      properties[`--${className}`] = value;
    }
  }
  return { classes, properties };
}
