import * as stylex from "@stylexjs/stylex";
import { dynamic, type JSX, type ValidComponent } from "@solidjs/web";
import { createParts, type PolymorphicProps } from "#/src/parts.ts";
import type { VariableProp } from "#/src/style-props.ts";

const styles = stylex.create({
  root: {
    "--flex-align": "initial",
    "--flex-column-gap": "var(--flex-gap)",
    "--flex-direction": "initial",
    "--flex-gap": "initial",
    "--flex-justify": "initial",
    "--flex-row-gap": "var(--flex-gap)",
    "--flex-wrap": "initial",
    alignItems: "var(--flex-align)",
    columnGap: "var(--flex-column-gap)",
    display: "flex",
    flexDirection: "var(--flex-direction)",
    flexWrap: "var(--flex-wrap)",
    justifyContent: "var(--flex-justify)",
    rowGap: "var(--flex-row-gap)",
  },
});

export type FlexProps<T extends ValidComponent = "div"> = PolymorphicProps<
  T,
  typeof styles,
  {
    gap?: VariableProp<"flex-gap">;
    rowGap?: VariableProp<"flex-row-gap">;
    columnGap?: VariableProp<"flex-column-gap">;
    align?: VariableProp<"flex-align", JSX.CSSProperties["align-items"]>;
    justify?: VariableProp<"flex-justify", JSX.CSSProperties["justify-content"]>;
    wrap?: VariableProp<"flex-wrap", JSX.CSSProperties["flex-wrap"]>;
    direction?: VariableProp<"flex-direction", JSX.CSSProperties["flex-direction"]>;
  }
>;

export function Flex<T extends ValidComponent = "div">(props: FlexProps<T>): JSX.Element;
export function Flex(props: FlexProps): JSX.Element;
export function Flex<T extends ValidComponent = "div">(props: FlexProps<T>) {
  const { root } = createParts("Flex", styles, props, {
    variables: {
      "flex-align": "align",
      "flex-column-gap": "columnGap",
      "flex-direction": "direction",
      "flex-gap": "gap",
      "flex-justify": "justify",
      "flex-row-gap": "rowGap",
      "flex-wrap": "wrap",
    },
  });
  const Root = dynamic(() => props.component ?? "div");
  return <Root {...root} />;
}
