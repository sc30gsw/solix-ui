import * as stylex from "@stylexjs/stylex";
import { dynamic, type JSX, type ValidComponent } from "@solidjs/web";
import { createParts, type PolymorphicProps, withDefaults } from "#/src/parts.ts";
import { flexVariables } from "#/src/Flex.variables.ts";
import type { GapProps, VariableProp } from "#/src/style-props.ts";

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
  GapProps<typeof flexVariables, "flex-gap", "flex-row-gap", "flex-column-gap"> & {
    /** How items line up across the main axis, as CSS `align-items`. */
    align?: VariableProp<typeof flexVariables, "flex-align", JSX.CSSProperties["align-items"]>;
    /** How items spread along the main axis, as CSS `justify-content`. */
    justify?: VariableProp<
      typeof flexVariables,
      "flex-justify",
      JSX.CSSProperties["justify-content"]
    >;
    /** Whether items wrap onto new lines, as CSS `flex-wrap`. */
    wrap?: VariableProp<typeof flexVariables, "flex-wrap", JSX.CSSProperties["flex-wrap"]>;
    /** The main axis and its direction, as CSS `flex-direction`. */
    direction?: VariableProp<
      typeof flexVariables,
      "flex-direction",
      JSX.CSSProperties["flex-direction"]
    >;
  }
>;

const defaults = { component: "div" } satisfies Partial<FlexProps>;

export function Flex<T extends ValidComponent = "div">(props: FlexProps<T>): JSX.Element;
export function Flex(props: FlexProps): JSX.Element;
export function Flex<T extends ValidComponent = "div">(rawProps: FlexProps<T>) {
  const props = withDefaults(defaults, rawProps);
  const { root } = createParts(flexVariables, styles, props, {
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
  const Root = dynamic(() => props.component);
  return <Root {...root} />;
}
