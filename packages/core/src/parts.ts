import * as stylex from "@stylexjs/stylex";
import { createMemo, merge, omit } from "solid-js";
import type { ComponentProps, JSX, ValidComponent } from "@solidjs/web";
import { stableClass } from "./stable-class";
import { stylePropKeys } from "./style-prop-table";
import { presentStyle, resolveStyleProps, type StyleProps, withConsumerStyle } from "./style-props";

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

export type PartProps = Readonly<Record<string, unknown>>;

export type PartsBehaviour = Readonly<Record<string, (ours: PartProps) => PartProps>>;

type Parts<Styles, Props, KeptOffRoot extends keyof Props> = {
  root: RootProps<Props, KeptOffRoot>;
  part: (name: OtherPart<Styles>) => Part;
};

type Stylable<Styles> = StylesApiProps<Styles> & StyleProps & Styling & { component?: unknown };

export function createParts<
  Styles extends Compiled,
  Props extends Stylable<Styles>,
  KeptOffRoot extends keyof Props = never,
>(
  component: string,
  compiled: Styles,
  props: Props,
  ...keptOffRoot: KeptOffRoot[]
): Parts<Styles, Props, KeptOffRoot>;
export function createParts<
  Styles extends Compiled,
  Props extends Stylable<Styles>,
  KeptOffRoot extends keyof Props = never,
>(
  component: string,
  compiled: Styles,
  props: Props,
  behaviour: PartsBehaviour,
  ...keptOffRoot: KeptOffRoot[]
): Parts<Styles, Props, KeptOffRoot>;
export function createParts<
  Styles extends Compiled,
  Props extends Stylable<Styles>,
  KeptOffRoot extends keyof Props = never,
>(
  component: string,
  compiled: Styles,
  props: Props,
  ...behaviourThenKeptOffRoot: (PartsBehaviour | KeptOffRoot)[]
): Parts<Styles, Props, KeptOffRoot> {
  const behaviour = behaviourThenKeptOffRoot.find(
    (given): given is PartsBehaviour => typeof given === "object",
  );
  const keptOffRoot = behaviourThenKeptOffRoot.filter(
    (given): given is KeptOffRoot => typeof given !== "object",
  );
  const rest = omit(props, ...keptOffRoot);
  const resolved = createMemo(() => resolveStyleProps(rest));
  const wrapsAComponent = () => typeof props.component === "function";
  const stylesApi = omit(rest, (key) => !isStylesApiPropKey(key));
  const partClass = (name: keyof Styles & string): JSX.ClassValue => [
    props.unstyled ? undefined : stylex.attrs(compiled[name]).class,
    stableClass(component, name),
    props.classes?.[name],
  ];
  const ownStyle = (name: keyof Styles & string): JSX.CSSProperties =>
    presentStyle(props.styles?.[name]);
  const root = merge(
    omit<Record<string, unknown>, typeof handledKeys>(rest, ...handledKeys),
    () => (wrapsAComponent() ? stylesApi : {}),
    {
      get class() {
        return [partClass(rootPart), resolved().classes, props.class];
      },
      get style() {
        return withConsumerStyle({ ...resolved().properties, ...ownStyle(rootPart) }, props.style);
      },
    },
  );
  const part = (name: OtherPart<Styles>): Part => ({
    get class() {
      return partClass(name);
    },
    get style() {
      return withConsumerStyle(ownStyle(name));
    },
  });
  if (behaviour === undefined) return { root: root as RootProps<Props, KeptOffRoot>, part };
  const bound = Object.keys(behaviour);
  const unknown = bound.filter((name) => !Object.hasOwn(compiled, name));
  if (unknown.length > 0) {
    throw new Error(
      `${component}: its behaviour binds ${unknown.join(", ")}, which its styles do not name as a part.`,
    );
  }
  const withBehaviour = new Map(
    [rootPart, ...bound.filter((name) => name !== rootPart)].map((name) => [
      name,
      behaviour[name]?.(name === rootPart ? root : part(name as OtherPart<Styles>)),
    ]),
  );
  return {
    root: (withBehaviour.get(rootPart) ?? root) as RootProps<Props, KeptOffRoot>,
    part: (name) => (withBehaviour.get(name) ?? part(name)) as Part,
  };
}
