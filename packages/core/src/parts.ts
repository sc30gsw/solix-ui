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
  /** Classes for each part, by its name, next to the part's own. */
  classes?: Partial<Record<keyof Styles, JSX.ClassValue>>;
  /** Inline styles for each part, by its name. */
  styles?: Partial<Record<keyof Styles, JSX.CSSProperties>>;
  /** Drops the library's look from every part, keeping its behaviour. */
  unstyled?: boolean;
};

export type ControlledProps<V> = {
  /** The current value, which makes the component controlled: it changes only when this does. */
  value?: V;
  /** The value at first, while the component keeps its own. */
  defaultValue?: V;
  /** Called with the new value when the user changes it. */
  onChange?: (value: V) => void;
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
  /** Classes for the root, next to the component's own. */
  class?: JSX.ClassValue;
  /** Inline style for the root, over the component's own. */
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
> = ElementProps<
  T,
  Styles,
  OwnProps & {
    /** The element or component rendered as the root. */
    component?: T;
  } & { [Key in RefusedBy<T>]?: never }
>;

type Part = {
  readonly class: JSX.ClassValue;
  readonly style: JSX.CSSProperties | string | undefined;
};

type Compiled = Record<typeof rootPart, stylex.CompiledStyles> &
  Readonly<Record<string, stylex.CompiledStyles>>;

type RootProps<Props, KeptOffRoot extends keyof Props> = Omit<Props, HandledKey | KeptOffRoot> &
  Part;

type OtherPart<Styles> = Exclude<keyof Styles, typeof rootPart> & string;

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
