import * as stylex from "@stylexjs/stylex";
import { dynamic, type JSX, type ValidComponent } from "@solidjs/web";
import { createParts, type PolymorphicProps } from "./parts";
import { type Spacing, type StyleProp, variables } from "./style-props";

const styles = stylex.create({
  root: {
    display: "flex",
  },
});

export type FlexProps<T extends ValidComponent = "div"> = PolymorphicProps<
  T,
  typeof styles,
  {
    gap?: StyleProp<Spacing>;
    rowGap?: StyleProp<Spacing>;
    columnGap?: StyleProp<Spacing>;
    align?: StyleProp<JSX.CSSProperties["align-items"]>;
    justify?: StyleProp<JSX.CSSProperties["justify-content"]>;
    wrap?: StyleProp<JSX.CSSProperties["flex-wrap"]>;
    direction?: StyleProp<JSX.CSSProperties["flex-direction"]>;
  }
>;

export function Flex<T extends ValidComponent = "div">(props: FlexProps<T>): JSX.Element;
export function Flex(props: FlexProps): JSX.Element;
export function Flex<T extends ValidComponent = "div">(props: FlexProps<T>) {
  const { root } = createParts(
    "Flex",
    styles,
    props,
    () =>
      variables({
        "flex-align": props.align,
        "flex-column-gap": props.columnGap,
        "flex-direction": props.direction,
        "flex-gap": props.gap,
        "flex-justify": props.justify,
        "flex-row-gap": props.rowGap,
        "flex-wrap": props.wrap,
      }),
    "align",
    "columnGap",
    "direction",
    "gap",
    "justify",
    "rowGap",
    "wrap",
  );
  const Root = dynamic(() => props.component ?? "div");
  return <Root {...root} />;
}
