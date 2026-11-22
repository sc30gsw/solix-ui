import * as stylex from "@stylexjs/stylex";
import { merge, omit } from "solid-js";
import type { ComponentProps, JSX, ValidComponent } from "@solidjs/web";
import { type ColorOption, type ColorPropKey, colorResolver } from "#/src/colors.ts";
import { stableClass } from "#/src/stable-class.ts";
import { stylePropKeys } from "#/src/style-prop-table.ts";
import { type Variables } from "#/src/variables.ts";
import {
  type VariableSource,
  presentStyle,
  type QueryContainer,
  type Resolver,
  type StyleProps,
  stylePropResolver,
  variablesResolver,
  withConsumerStyle,
} from "#/src/style-props.ts";

export const rootPart = "root";

export type StylesApiProps<Styles> = {
  /** They go next to each part's own classes. */
  classes?: Partial<Record<keyof Styles, JSX.ClassValue>>;
  styles?: Partial<Record<keyof Styles, JSX.CSSProperties>>;
  /** Every part keeps its behaviour. */
  unstyled?: boolean;
};

export type ControlledProps<V> = {
  /** The current value, which makes the component controlled: it changes only when this does. Where its type takes `null`, `null` selects nothing. */
  value?: V;
  /** The value at first, while the component keeps its own. Where its type takes `null`, `null` selects nothing. */
  defaultValue?: V;
  /** Called when the user changes the value. */
  onChange?: (value: V) => void;
};

export type OpenedProps = {
  /** The consumer sets it, and `onClose` says when the user closed it. */
  opened: boolean;
};

type StylesApiPropKey = keyof StylesApiProps<object>;

const stylesApiProps = { classes: true, styles: true, unstyled: true } satisfies Record<
  StylesApiPropKey,
  true
>;

function isStylesApiPropKey(name: PropertyKey): name is StylesApiPropKey {
  return Object.hasOwn(stylesApiProps, name);
}

export const stylesApiPropKeys = Object.keys(stylesApiProps).filter(isStylesApiPropKey);

export const handledKeys = [
  "class",
  "style",
  "component",
  ...stylesApiPropKeys,
  ...stylePropKeys,
] as const;

export type HandledKey = (typeof handledKeys)[number];

type Styling = {
  /** They go on the root, next to the component's own classes. */
  class?: JSX.ClassValue;
  /** It goes on the root, over the component's own style. */
  style?: JSX.CSSProperties | string;
};

type RefusedBy<T extends ValidComponent> = {
  [Key in keyof ComponentProps<T> & keyof StyleProps]-?: [
    NonNullable<ComponentProps<T>[Key]>,
  ] extends [never]
    ? Key
    : never;
}[keyof ComponentProps<T> & keyof StyleProps];

export type ElementProps<
  T extends ValidComponent,
  Styles,
  OwnProps extends object = object,
> = OwnProps &
  StylesApiProps<Styles> &
  StyleProps &
  Styling &
  Omit<ComponentProps<T>, keyof OwnProps | HandledKey>;

export type PolymorphicProps<
  T extends ValidComponent,
  Styles,
  OwnProps extends object = object,
> = ElementProps<T, Styles, OwnProps & { component?: T } & { [Key in RefusedBy<T>]?: never }>;

type Part = {
  readonly class: JSX.ClassValue;
  readonly style: JSX.CSSProperties | string | undefined;
};

type Compiled = Record<typeof rootPart, stylex.CompiledStyles> &
  Readonly<Record<string, stylex.CompiledStyles>>;

type RootProps<Props, KeptOffRoot extends keyof Props> = Omit<Props, HandledKey | KeptOffRoot> &
  Part;

type OtherPart<Styles> = Exclude<keyof Styles, typeof rootPart> & string;

declare const definedFor: unique symbol;

export type Defaults<P, D> = {
  readonly [definedFor]: { readonly props: P; readonly values: D };
};

type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never;

type OneLiteral<T> = [T] extends [string | number | boolean]
  ? true extends IsUnion<T>
    ? never
    : string extends T
      ? never
      : number extends T
        ? never
        : T
  : never;

export type LiteralValues<D> = { readonly [K in keyof D]-?: OneLiteral<D[K]> };

type DefaultsFor<P, D> = {
  readonly [K in keyof D]: K extends keyof P
    ? K extends keyof ControlledProps<unknown>
      ? never
      : OneLiteral<D[K]> & Exclude<P[K], undefined>
    : never;
};

/**
 * Declares the defaults of the props type `P`, one literal for each prop that has one, as
 * `defaultsOf<P>()({ … })`. A key that is not a prop of `P` and a value that is not one literal of
 * the prop's type are refused. So are the props of `ControlledProps`: `withDefaults` gives the
 * default for `null` too, and `null` in `value` or `defaultValue`, as in Tabs, selects nothing.
 */
export function defaultsOf<P extends object>() {
  return <const D extends object>(values: D & DefaultsFor<P, D>): Defaults<P, D> =>
    values as unknown as Defaults<P, D>;
}

export type DefaultValues<T> = T extends Defaults<unknown, infer D> ? D : never;

export type WithDefaults<P, D> = Omit<P, keyof D> & {
  [K in keyof D & keyof P]-?: Exclude<P[K], undefined> | D[K];
};

export function withDefaults<P extends object, D extends LiteralValues<D>>(
  defaults: Defaults<unknown, D>,
  props: P,
): WithDefaults<P, D> {
  const filled: Record<string, unknown> = {};
  for (const key of Object.keys(defaults)) {
    Object.defineProperty(filled, key, {
      enumerable: true,
      get: () => Reflect.get(props, key) ?? Reflect.get(defaults, key),
    });
  }
  return merge(props, filled) as WithDefaults<P, D>;
}

export type CarriedStyling = {
  readonly class: () => JSX.ClassValue;
  readonly style: () => JSX.CSSProperties | undefined;
};

type VariablesOption<Of, Props> = [Of] extends [Variables<infer Rows>]
  ? { readonly variables: { readonly [Variable in keyof Rows & string]: VariableSource<Props> } }
  : { readonly variables?: never };

export type PartsOptions<Of, Props> = VariablesOption<Of, Props> & {
  readonly keep?: readonly (keyof Props & string)[];
  readonly color?: ColorOption;
  readonly queries?: QueryContainer;
  readonly carried?: CarriedStyling;
};

type KeptBy<Options> =
  | (Options extends { keep: readonly (infer Kept)[] } ? Kept : never)
  | (Options extends { variables: infer Sources } ? Extract<Sources[keyof Sources], string> : never)
  | (Options extends { color: ColorOption } ? ColorPropKey : never);

type TakenWith<Options, Props> = Options extends { color: ColorOption<infer Variant> }
  ? Props & { readonly variant?: Variant }
  : Props & { readonly [Key in Exclude<ColorPropKey, "variant">]?: never };

type Parts<Styles, Props, KeptOffRoot extends keyof Props> = {
  root: RootProps<Props, KeptOffRoot>;
  part: (name: OtherPart<Styles>) => Part;
};

type PartsInput = StylesApiProps<Compiled> &
  StyleProps &
  Styling & { component?: unknown } & Record<string, unknown>;

function isResolver(resolver: Resolver | undefined): resolver is Resolver {
  return resolver !== undefined;
}

export function createParts<
  Of extends string | Variables,
  Styles extends Compiled,
  Props extends StylesApiProps<Styles> & StyleProps & Styling & { component?: unknown },
  const Options extends PartsOptions<Of, Props>,
>(
  of: Of,
  compiled: Styles,
  props: TakenWith<Options, Props>,
  ...[options]: [Of] extends [Variables] ? [options: Options] : [options?: Options]
): Parts<Styles, Props, KeptBy<Options> & keyof Props>;
export function createParts(
  of: string | Variables,
  compiled: Compiled,
  props: PartsInput,
  options?: Partial<PartsOptions<Variables, PartsInput>>,
): Parts<Compiled, PartsInput, never> {
  const component = typeof of === "string" ? of : of.component;
  const own = [
    options?.color === undefined ? undefined : colorResolver(options.color, props),
    typeof of === "string" || options?.variables === undefined
      ? undefined
      : variablesResolver(of, options.variables, props, options.queries),
  ].filter(isResolver);
  const rest = omit(props, ...(options?.keep ?? []), ...own.flatMap(({ keys }) => keys));
  const resolvers = [...own, stylePropResolver(rest)];
  const wrapsAComponent = () => typeof props.component === "function";
  const stylesApi = omit(rest, (key) => !isStylesApiPropKey(key));
  const partClass = (name: string): JSX.ClassValue => [
    props.unstyled ? undefined : stylex.attrs(compiled[name]).class,
    stableClass(component, name),
    name === rootPart ? options?.carried?.class() : undefined,
    props.classes?.[name],
  ];
  const ownStyle = (name: string): JSX.CSSProperties => presentStyle(props.styles?.[name]);
  const forwarded: object = omit<Record<string, unknown>, typeof handledKeys>(rest, ...handledKeys);
  const root = merge(
    forwarded,
    () => (wrapsAComponent() ? stylesApi : {}),
    () => resolvers.reduce((all, { resolved }) => ({ ...all, ...resolved().attributes }), {}),
    {
      get class() {
        return [
          partClass(rootPart),
          resolvers.flatMap(({ resolved }) => resolved().classes),
          props.class,
        ];
      },
      get style() {
        return withConsumerStyle(
          {
            ...resolvers.reduce((all, { resolved }) => ({ ...all, ...resolved().properties }), {}),
            ...presentStyle(options?.carried?.style()),
            ...ownStyle(rootPart),
          },
          props.style,
        );
      },
    },
  );
  const part = (name: string): Part => ({
    get class() {
      return partClass(name);
    },
    get style() {
      return withConsumerStyle(ownStyle(name));
    },
  });
  return { root, part };
}
