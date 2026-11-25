import type { JSX } from "@solidjs/web";
import { createMemo } from "solid-js";
import {
  baseKey,
  type Breakpoint,
  breakpoints,
  canonicalOf,
  containerVariableClass,
  type PropertyRow,
  type ResponsiveKey,
  type RowOf,
  type Scale,
  stylePropClass,
  stylePropKeys,
  type StylePropName,
  type StylePropRows,
  stylePropNames,
  stylePropTable,
  variableClass,
  visibilityClass,
  type VisibilityPropName,
  type VisibilityRows,
  type VisibilityValue,
  visibilityPropNames,
} from "#/src/style-prop-table.ts";
import type {
  ContainerQueries,
  ContainerWidth,
  QueryContainer,
  Used,
} from "#/src/query-container.ts";
import { type VariableRow, type Variables } from "#/src/variables.ts";
import { colorValueOf } from "#/src/color-table.ts";
import { declarable } from "#/src/css-syntax.ts";
import { tokens } from "#/src/tokens.stylex.ts";

const pixelsPerRem = 16;
const colorScale = "color" satisfies Scale;

type Absent = null | undefined;
type TokenKey<Name, Of extends Scale> = Name extends `--solix-${Of}-${infer Key}` ? Key : never;
export type ScaleKey<Of extends Scale> = TokenKey<Extract<keyof typeof tokens, string>, Of>;
type ValueOf<Row> = Row extends PropertyRow
  ? | NonNullable<JSX.CSSProperties[Row["property"]]>
    | (Row["kind"] extends "length" ? number : never)
    | (Row extends { scale: infer Of extends Scale } ? ScaleKey<Of> : never)
  : never;

export type StyleProp<V> = V | Absent | { [Key in ResponsiveKey]?: V | Absent };

/** A key of a token scale, a number of pixels written in rem, or any CSS length. */
export type ScaleValue<Of extends Scale> = ScaleKey<Of> | number | (string & {});

export type Spacing = ScaleValue<"spacing">;

/**
 * A value for every width, or values keyed by the container width each applies from: a length
 * such as `"40em"`, or a breakpoint, which stands for the library's width for it, in rem.
 */
export type ContainerProp<V> =
  | V
  | Absent
  | { [Key in typeof baseKey | Breakpoint | ContainerWidth]?: V | Absent };

type Keyed<V> = V | Absent | Readonly<Record<string, V | Absent>>;

type DefaultValue<Row extends VariableRow> = Row extends {
  kind: "length";
  scale: infer Of extends Scale;
}
  ? ScaleValue<Of>
  : Row extends { kind: "length" }
    ? number | (string & {})
    : string | number;

export type VariableProp<
  Of extends Variables,
  Name extends keyof Of["rows"],
  Value = DefaultValue<Of["rows"][Name]>,
> = Of["rows"][Name]["responsive"] extends true ? StyleProp<Value> : Value | Absent;

export type GapProps<
  Of extends Variables,
  Gap extends keyof Of["rows"],
  RowGap extends keyof Of["rows"],
  ColumnGap extends keyof Of["rows"],
> = {
  /** `rowGap` and `columnGap` override it. */
  gap?: VariableProp<Of, Gap>;
  rowGap?: VariableProp<Of, RowGap>;
  columnGap?: VariableProp<Of, ColumnGap>;
};

export type GridTypeProps<Media extends object, Container extends object> =
  | ({
      /** `media` keys responsive values by the viewport's width; `container` keys them by the grid's own width, through container queries. */
      type?: "media";
    } & Media)
  | ({
      type: "container";
    } & Container);

export type GridType = NonNullable<GridTypeProps<object, object>["type"]>;

export type GridTypeVariableProp<
  Type extends GridType,
  Of extends Variables,
  Name extends keyof Of["rows"],
  Value = DefaultValue<Of["rows"][Name]>,
> = Type extends "container" ? ContainerProp<Value> : VariableProp<Of, Name, Value>;

export type VariableValue = Keyed<string | number>;

export type ResolvedVariables = Resolved & { readonly used: readonly Used[] };

type StylePropsOf<Table extends StylePropRows> = {
  -readonly [Name in keyof Table]?: StyleProp<ValueOf<RowOf<Name & StylePropName>>>;
};
type VisibilityPropsOf<Table extends VisibilityRows> = {
  -readonly [Name in keyof Table]?: VisibilityValue<Name & VisibilityPropName> | Absent;
};

export type StyleProps = StylePropsOf<StylePropRows> & VisibilityPropsOf<VisibilityRows>;

export type Resolved = {
  readonly classes: readonly string[];
  readonly properties: Readonly<Record<`--${string}`, string>>;
  readonly attributes: Readonly<Record<string, string>>;
};

export type Resolver = {
  readonly keys: readonly string[];
  readonly resolved: () => Resolved;
};

export type VariableSource<Props> = (keyof Props & string) | ((props: Props) => VariableValue);

function keyedEntries<Key extends string>(
  value: VariableValue,
  keys: readonly Key[],
): [typeof baseKey | Key, string | number][] {
  const given = declarable(value);
  if (given === undefined) return [];
  if (typeof given !== "object") return [[baseKey, given]];
  const keyed: Partial<Record<string, string | number | Absent>> = given;
  const every: (typeof baseKey | Key)[] = [baseKey, ...keys];
  return every.flatMap((key): [typeof baseKey | Key, string | number][] => {
    const each = declarable(keyed[key]);
    return each === undefined ? [] : [[key, each]];
  });
}

export function declaresAValue(value: VariableValue): boolean {
  return keyedEntries(value, breakpoints).length > 0;
}

export function tokenOf(scale: Scale, key: string): string | undefined {
  const token = `--solix-${scale}-${key}`;
  return Object.hasOwn(tokens, token) ? token : undefined;
}

function cssValue(
  row: Pick<PropertyRow, "kind" | "scale">,
  written: string | number,
): string | undefined {
  if (typeof written === "number") {
    return row.kind === "length" ? `${written / pixelsPerRem}rem` : String(written);
  }
  const token = row.scale === undefined ? undefined : tokenOf(row.scale, written);
  if (token !== undefined) return `var(${token})`;
  return row.scale === colorScale ? (colorValueOf(written) ?? written) : written;
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

export function resolveStyleProps(props: StyleProps): Resolved {
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
    const className = visibilityClass(name, props[name]);
    if (className !== undefined) classes.add(className);
  }
  return { classes: [...classes], properties, attributes: {} };
}

export function stylePropResolver(props: StyleProps): Resolver {
  return { keys: stylePropKeys, resolved: createMemo(() => resolveStyleProps(props)) };
}

export function eachValue<V extends string | number>(
  value: Keyed<V>,
  write: (given: V) => string | undefined,
): Keyed<string> {
  const given = declarable(value);
  if (given === undefined) return undefined;
  if (typeof given !== "object") return write(given);
  return Object.fromEntries(
    Object.entries(given).map(([key, each]) => {
      const kept = declarable(each);
      return [key, kept === undefined ? kept : write(kept)];
    }),
  );
}

export function withBase<V extends string | number>(value: Keyed<V>, base: V): Keyed<V> {
  const given = declarable(value);
  if (given === undefined) return base;
  if (typeof given !== "object") return given;
  return { ...given, [baseKey]: declarable(given[baseKey]) ?? base };
}

function placed(
  name: string,
  row: VariableRow,
  value: VariableValue,
  queries: ContainerQueries | undefined,
): [className: string, written: string | number, slot: number | undefined][] {
  if (!row.responsive) {
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

function isVariableValue(value: unknown): value is VariableValue {
  return (
    value === undefined || value === null || ["string", "number", "object"].includes(typeof value)
  );
}

export function resolveVariables(
  variables: Variables,
  values: Readonly<Record<string, unknown>>,
  queries: ContainerQueries | undefined,
  leaveOut: (row: VariableRow) => boolean,
): ResolvedVariables {
  const classes: string[] = [];
  const properties: Record<`--${string}`, string> = {};
  const used: Used[] = [];
  for (const [name, row] of Object.entries(variables.rows)) {
    if (leaveOut(row)) continue;
    const value = values[name];
    const keyed = isVariableValue(value) ? value : undefined;
    for (const [className, written, slot] of placed(name, row, keyed, queries)) {
      const value = cssValue(row, written);
      if (value === undefined) continue;
      classes.push(className);
      properties[`--${className}`] = value;
      if (slot !== undefined) used.push([name, slot]);
    }
  }
  return { classes, properties, attributes: {}, used };
}

export function variablesResolver<Props extends Readonly<Record<string, unknown>>>(
  variables: Variables,
  from: Readonly<Record<string, VariableSource<Props>>>,
  props: Props,
  queries: QueryContainer | undefined,
): Resolver {
  const resolved = createMemo(() =>
    resolveVariables(
      variables,
      Object.fromEntries(
        Object.entries(from).map(([name, source]) => [
          name,
          typeof source === "string" ? props[source] : source(props),
        ]),
      ),
      queries?.queries(),
      (row) => props.unstyled === true && row.children !== undefined,
    ),
  );
  queries?.report(() => resolved().used);
  return {
    keys: Object.values(from).filter((source) => typeof source === "string"),
    resolved,
  };
}
