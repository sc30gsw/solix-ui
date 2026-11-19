import * as stylex from "@stylexjs/stylex";
import { createMemo, merge, omit } from "solid-js";
import type { ComponentProps, JSX, ValidComponent } from "@solidjs/web";
import { type ColorPropKey, colorPropKeys, resolveColor } from "#/src/colors.ts";
import { stableClass } from "#/src/stable-class.ts";
import {
  hasChildRules,
  isVariableGroup,
  stylePropKeys,
  type VariableGroup,
  type VariablesOf,
  variantAttribute,
} from "#/src/style-prop-table.ts";
import {
  presentStyle,
  type QueryContainer,
  type ResolvedVariables,
  resolveStyleProps,
  resolveVariables,
  type StyleProps,
  type VariableValue,
  withConsumerStyle,
} from "#/src/style-props.ts";

export const rootPart = "root";

export type StylesApiProps<Styles> = {
  classes?: Partial<Record<keyof Styles, JSX.ClassValue>>;
  styles?: Partial<Record<keyof Styles, JSX.CSSProperties>>;
  unstyled?: boolean;
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

type Styling = { class?: JSX.ClassValue; style?: JSX.CSSProperties | string };

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

type Given<Props> = (keyof Props & string) | ((props: Props) => VariableValue);

export type CarriedStyling = {
  readonly class: () => JSX.ClassValue;
  readonly style: () => JSX.CSSProperties | undefined;
};

type VariablesOption<Name extends string, Props> = Name extends VariableGroup
  ? { readonly variables: { readonly [Variable in VariablesOf<Name>]: Given<Props> } }
  : { readonly variables?: never };

export type PartsOptions<Name extends string, Props> = VariablesOption<Name, Props> & {
  readonly keep?: readonly (keyof Props & string)[];
  readonly color?: string;
  readonly queries?: QueryContainer;
  readonly carried?: CarriedStyling;
};

type KeptBy<Options> =
  | (Options extends { keep: readonly (infer Kept)[] } ? Kept : never)
  | (Options extends { variables: infer Given } ? Extract<Given[keyof Given], string> : never)
  | (Options extends { color: string } ? ColorPropKey : never);

type Parts<Styles, Props, KeptOffRoot extends keyof Props> = {
  root: RootProps<Props, KeptOffRoot>;
  part: (name: OtherPart<Styles>) => Part;
};

type PartsInput = StylesApiProps<Compiled> &
  StyleProps &
  Styling & { component?: unknown } & Record<string, unknown>;

const noVariables: ResolvedVariables = { classes: [], properties: {}, used: [] };

type GivenOptions = {
  readonly variables?: Readonly<Record<string, Given<Record<string, unknown>>>>;
  readonly keep?: readonly string[];
  readonly color?: string;
  readonly queries?: QueryContainer;
  readonly carried?: CarriedStyling;
};

export function createParts<
  Name extends string,
  Styles extends Compiled,
  Props extends StylesApiProps<Styles> & StyleProps & Styling & { component?: unknown },
  const Options extends PartsOptions<Name, Props>,
>(
  component: Name,
  compiled: Styles,
  props: Props,
  ...[given]: Name extends VariableGroup ? [options: Options] : [options?: Options]
): Parts<Styles, Props, KeptBy<Options> & keyof Props> {
  const options: GivenOptions = given ?? {};
  const input: PartsInput = props;
  const ownProps = Object.values(options.variables ?? {}).filter(
    (prop): prop is string => typeof prop === "string",
  );
  const defaultVariant = options.color;
  const colorProps = defaultVariant === undefined ? [] : colorPropKeys;
  const rest = omit(input, ...(options.keep ?? []), ...ownProps, ...colorProps);
  const colored = createMemo(() =>
    defaultVariant === undefined
      ? noVariables
      : { ...resolveColor(input.color, input.autoContrast), used: [] },
  );
  const resolved = createMemo(() => resolveStyleProps(rest));
  const variables = createMemo(() => {
    if (options.variables === undefined || !isVariableGroup(component)) return noVariables;
    const values = Object.fromEntries(
      Object.entries(options.variables).map(([name, from]) => [
        name,
        typeof from === "string" ? input[from] : from(input),
      ]),
    );
    return resolveVariables(
      component,
      values,
      options.queries?.queries(),
      (name) => input.unstyled === true && hasChildRules(name),
    );
  });
  options.queries?.report(() => variables().used);
  const wrapsAComponent = () => typeof input.component === "function";
  const stylesApi = omit(rest, (key) => !isStylesApiPropKey(key));
  const partClass = (name: string): JSX.ClassValue => [
    input.unstyled ? undefined : stylex.attrs(compiled[name]).class,
    stableClass(component, name),
    name === rootPart ? options.carried?.class() : undefined,
    input.classes?.[name],
  ];
  const ownStyle = (name: string): JSX.CSSProperties => presentStyle(input.styles?.[name]);
  const root = merge(
    omit<Record<string, unknown>, typeof handledKeys>(rest, ...handledKeys),
    () => (wrapsAComponent() ? stylesApi : {}),
    defaultVariant === undefined
      ? {}
      : {
          get [variantAttribute]() {
            return typeof input.variant === "string" ? input.variant : defaultVariant;
          },
        },
    {
      get class() {
        return [
          partClass(rootPart),
          colored().classes,
          variables().classes,
          resolved().classes,
          input.class,
        ];
      },
      get style() {
        return withConsumerStyle(
          {
            ...colored().properties,
            ...variables().properties,
            ...resolved().properties,
            ...presentStyle(options.carried?.style()),
            ...ownStyle(rootPart),
          },
          input.style,
        );
      },
    },
  ) as RootProps<Props, KeptBy<Options> & keyof Props>;
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
