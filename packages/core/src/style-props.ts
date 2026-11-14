import type { ComponentProps, JSX, ValidComponent } from "@solidjs/web";
import {
  baseKey,
  type Breakpoint,
  canonicalOf,
  type PropertyRow,
  type ResponsiveKey,
  responsiveKeys,
  type RowOf,
  type Scale,
  stylePropClass,
  type StylePropName,
  stylePropNames,
  stylePropTable,
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

export type StyleProps = {
  [Name in StylePropName]?: StyleProp<ValueOf<RowOf<Name>>>;
} & { [Name in VisibilityPropName]?: Breakpoint | Absent };

export type Styling = { class?: JSX.ClassValue; style?: JSX.CSSProperties | string };

export type ElementProps<T extends ValidComponent, Own extends object = object> = Own &
  StyleProps &
  Styling &
  Omit<ComponentProps<T>, keyof Own | keyof StyleProps | keyof Styling | "component">;

export type PolymorphicProps<T extends ValidComponent, Own extends object = object> = ElementProps<
  T,
  Own & { component?: T }
>;

export const stylePropKeys: (keyof StyleProps)[] = [...stylePropNames, ...visibilityPropNames];

type ResolvedStyleProps = {
  classes: string[];
  style: JSX.CSSProperties | string | undefined;
};

function responsiveEntries(value: StyleProp<string | number>): [ResponsiveKey, string | number][] {
  if (value === undefined || value === null) return [];
  if (typeof value !== "object") return [[baseKey, value]];
  return responsiveKeys.flatMap((key): [ResponsiveKey, string | number][] => {
    const written = value[key];
    return written === undefined || written === null ? [] : [[key, written]];
  });
}

function cssValue(row: PropertyRow, written: string | number): string | undefined {
  if (typeof written === "number") {
    return row.kind === "length" ? `${written / pixelsPerRem}rem` : String(written);
  }
  if (characterThatEndsADeclaration.test(written)) return undefined;
  const token = `--solix-${row.scale}-${written}`;
  return row.scale !== undefined && Object.hasOwn(tokens, token) ? `var(${token})` : written;
}

function declarations(style: JSX.CSSProperties): string {
  return Object.entries(style)
    .map(([property, value]) => `${property}:${value};`)
    .join("");
}

export function withConsumerStyle(
  own: JSX.CSSProperties,
  consumer: JSX.CSSProperties | string | undefined,
): JSX.CSSProperties | string | undefined {
  if (typeof consumer === "string") return `${declarations(own)}${consumer}`;
  if (consumer === undefined && Object.keys(own).length === 0) return undefined;
  return { ...own, ...consumer };
}

export function resolveStyleProps(props: StyleProps & Pick<Styling, "style">): ResolvedStyleProps {
  const classes = new Set<string>();
  const own: Record<`--${string}`, string> = {};
  for (const name of stylePropNames) {
    const canonical = canonicalOf(name);
    for (const [key, written] of responsiveEntries(props[name])) {
      const value = cssValue(stylePropTable[canonical], written);
      if (value === undefined) continue;
      const className = stylePropClass(canonical, key);
      classes.add(className);
      own[`--${className}`] = value;
    }
  }
  for (const name of visibilityPropNames) {
    const breakpoint = props[name];
    if (breakpoint !== undefined && breakpoint !== null) {
      classes.add(visibilityClass(name, breakpoint));
    }
  }
  return { classes: [...classes], style: withConsumerStyle(own, props.style) };
}
