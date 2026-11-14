import * as stylex from "@stylexjs/stylex";
import { createMemo, merge, omit } from "solid-js";
import type { JSX } from "@solidjs/web";
import {
  resolveStyleProps,
  type StyleProps,
  stylePropKeys,
  type Styling,
  withConsumerStyle,
} from "./style-props";

/** The part every component has: the element it returns, which takes the consumer's props. */
export const rootPart = "root";

/** The props that restyle a component's parts, keyed by the parts of its compiled `stylex.create` block. */
export type PartProps<Compiled> = {
  classes?: Partial<Record<keyof Compiled, JSX.ClassValue>>;
  styles?: Partial<Record<keyof Compiled, JSX.CSSProperties>>;
  unstyled?: boolean;
};

type PartPropKey = keyof PartProps<object>;

const partProps = { classes: true, styles: true, unstyled: true } satisfies Record<
  PartPropKey,
  true
>;

function isPartPropKey(name: string): name is PartPropKey {
  return Object.hasOwn(partProps, name);
}

/** The names of the props that `PartProps` declares. No element receives them. */
export const partPropKeys = Object.keys(partProps).filter(isPartPropKey);

type Part = {
  readonly class: JSX.ClassValue;
  readonly style: JSX.CSSProperties | string | undefined;
};

type Compiled = Record<typeof rootPart, stylex.CompiledStyles> &
  Readonly<Record<string, stylex.CompiledStyles>>;

type Handled = keyof Styling | "component" | PartPropKey | keyof StyleProps;

type RootProps<Props, Own extends keyof Props> = Omit<Props, Handled | Own> & Part;

type OtherPart<Styles> = Exclude<keyof Styles, typeof rootPart> & string;

/**
 * Splits a component's props into the props of its root element and the class and style of each other part.
 *
 * The root's class is the library's class for it (left out with `unstyled`), `solix-<component>-root`,
 * `classes.root`, the style-prop classes and the consumer's `class`. Its style is the style props'
 * custom properties, `styles.root` and the consumer's `style`, in that order. Every other prop reaches
 * the root, except the component's `ownKeys`, which take no part in the style props either.
 */
export function createParts<
  Styles extends Compiled,
  Props extends PartProps<Styles> & StyleProps & Styling,
  Own extends keyof Props = never,
>(
  component: string,
  compiled: Styles,
  props: Props,
  ...ownKeys: Own[]
): {
  root: RootProps<Props, Own>;
  part: (name: OtherPart<Styles>) => Part;
} {
  const handled = new Set<PropertyKey>([
    "class",
    "style",
    "component",
    ...partPropKeys,
    ...stylePropKeys,
    ...ownKeys,
  ]);
  const styleProps = omit(props, (key) => ownKeys.some((own) => own === key));
  const resolved = createMemo(() => resolveStyleProps(styleProps));
  const libraryClass = (name: keyof Styles & string) =>
    props.unstyled ? undefined : stylex.attrs(compiled[name]).class;
  const root = merge(
    omit(props, (key) => handled.has(key)),
    {
      get class() {
        return [
          libraryClass(rootPart),
          `solix-${component}-${rootPart}`,
          props.classes?.[rootPart],
          resolved().classes,
          props.class,
        ];
      },
      get style() {
        return withConsumerStyle(
          { ...resolved().properties, ...props.styles?.[rootPart] },
          props.style,
        );
      },
    },
  ) as RootProps<Props, Own>;
  const part = (name: OtherPart<Styles>): Part => ({
    get class() {
      return [libraryClass(name), `solix-${component}-${name}`, props.classes?.[name]];
    },
    get style() {
      return props.styles?.[name];
    },
  });
  return { root, part };
}
