import * as stylex from "@stylexjs/stylex";
import { createMemo, merge, omit } from "solid-js";
import type { ComponentProps, JSX, ValidComponent } from "@solidjs/web";
import { stableClass } from "#/src/stable-class.ts";
import { stylePropKeys } from "#/src/style-prop-table.ts";
import {
  presentStyle,
  resolveStyleProps,
  type StyleProps,
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

export function createParts<
  Styles extends Compiled,
  Props extends StylesApiProps<Styles> & StyleProps & Styling & { component?: unknown },
  KeptOffRoot extends keyof Props = never,
>(
  component: string,
  compiled: Styles,
  props: Props,
  ...keptOffRoot: KeptOffRoot[]
): {
  root: RootProps<Props, KeptOffRoot>;
  part: (name: OtherPart<Styles>) => Part;
} {
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
  ) as RootProps<Props, KeptOffRoot>;
  const part = (name: OtherPart<Styles>): Part => ({
    get class() {
      return partClass(name);
    },
    get style() {
      return withConsumerStyle(ownStyle(name));
    },
  });
  return { root, part };
}
