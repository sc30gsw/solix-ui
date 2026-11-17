import * as stylex from "@stylexjs/stylex";
import { createMemo, merge, omit } from "solid-js";
import type { ComponentProps, JSX, ValidComponent } from "@solidjs/web";
import { stableClass } from "#/src/stable-class.ts";
import {
  hasChildRules,
  isVariableGroup,
  stylePropKeys,
  type VariableGroup,
  type VariablesOf,
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

export type PartsOptions<Group extends VariableGroup, Props> = {
  readonly variables: { readonly [Name in VariablesOf<Group>]: Given<Props> };
  readonly queries?: QueryContainer;
  readonly carried?: CarriedStyling;
};

type GivenProps<Options> = Options extends { variables: infer Given }
  ? Extract<Given[keyof Given], string>
  : never;

type Parts<Styles, Props, KeptOffRoot extends keyof Props> = {
  root: RootProps<Props, KeptOffRoot>;
  part: (name: OtherPart<Styles>) => Part;
};

type PartsInput = StylesApiProps<Compiled> & StyleProps & Styling & { component?: unknown };

const noVariables: ResolvedVariables = { classes: [], properties: {}, used: [] };

type GivenOptions = {
  readonly variables: Readonly<Record<string, Given<Record<string, unknown>>>>;
  readonly queries?: QueryContainer;
  readonly carried?: CarriedStyling;
};

function isOptions(given: unknown): given is GivenOptions {
  return typeof given === "object" && given !== null;
}

export function createParts<
  Name extends string,
  Styles extends Compiled,
  Props extends StylesApiProps<Styles> & StyleProps & Styling & { component?: unknown },
  KeptOffRoot extends keyof Props = never,
>(
  component: Name extends VariableGroup ? never : Name,
  compiled: Styles,
  props: Props,
  ...keptOffRoot: KeptOffRoot[]
): Parts<Styles, Props, KeptOffRoot>;
export function createParts<
  Group extends VariableGroup,
  Styles extends Compiled,
  Props extends StylesApiProps<Styles> & StyleProps & Styling & { component?: unknown },
  const Options extends PartsOptions<Group, Props>,
  KeptOffRoot extends keyof Props = never,
>(
  component: Group,
  compiled: Styles,
  props: Props,
  options: Options,
  ...keptOffRoot: KeptOffRoot[]
): Parts<Styles, Props, KeptOffRoot | (GivenProps<Options> & keyof Props)>;
export function createParts(
  component: string,
  compiled: Compiled,
  props: PartsInput & Record<string, unknown>,
  ...given: unknown[]
): Parts<Compiled, PartsInput, never> {
  const [first] = given;
  const options = isOptions(first) ? first : undefined;
  const ownProps = Object.values(options?.variables ?? {}).filter(
    (prop): prop is string => typeof prop === "string",
  );
  const keptOffRoot = given.filter((key): key is string => typeof key === "string");
  const rest = omit(props, ...keptOffRoot, ...ownProps);
  const resolved = createMemo(() => resolveStyleProps(rest));
  const variables = createMemo(() => {
    if (options === undefined || !isVariableGroup(component)) return noVariables;
    const values = Object.fromEntries(
      Object.entries(options.variables).map(([name, from]) => [
        name,
        typeof from === "string" ? props[from] : from(props),
      ]),
    );
    return resolveVariables(
      component,
      values,
      options.queries?.queries(),
      (name) => props.unstyled === true && hasChildRules(name),
    );
  });
  options?.queries?.report(() => variables().used);
  const wrapsAComponent = () => typeof props.component === "function";
  const stylesApi = omit(rest, (key) => !isStylesApiPropKey(key));
  const partClass = (name: string): JSX.ClassValue => [
    props.unstyled ? undefined : stylex.attrs(compiled[name]).class,
    stableClass(component, name),
    name === rootPart ? options?.carried?.class() : undefined,
    props.classes?.[name],
  ];
  const ownStyle = (name: string): JSX.CSSProperties => presentStyle(props.styles?.[name]);
  const root = merge(
    omit<Record<string, unknown>, typeof handledKeys>(rest, ...handledKeys),
    () => (wrapsAComponent() ? stylesApi : {}),
    {
      get class() {
        return [partClass(rootPart), variables().classes, resolved().classes, props.class];
      },
      get style() {
        return withConsumerStyle(
          {
            ...variables().properties,
            ...resolved().properties,
            ...presentStyle(options?.carried?.style()),
            ...ownStyle(rootPart),
          },
          props.style,
        );
      },
    },
  ) as RootProps<PartsInput, never>;
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
