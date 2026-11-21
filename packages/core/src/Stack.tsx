import * as stylex from "@stylexjs/stylex";
import type { JSX } from "@solidjs/web";
import { createParts, type ElementProps } from "#/src/parts.ts";
import { stackVariables } from "#/src/Stack.variables.ts";
import type { VariableProp } from "#/src/style-props.ts";
import { tokens } from "#/src/tokens.stylex.ts";

const styles = stylex.create({
  root: {
    "--stack-align": "stretch",
    "--stack-gap": tokens["--solix-spacing-md"],
    "--stack-justify": "flex-start",
    alignItems: "var(--stack-align)",
    display: "flex",
    flexDirection: "column",
    gap: "var(--stack-gap)",
    justifyContent: "var(--stack-justify)",
  },
});

export type StackProps = ElementProps<
  "div",
  typeof styles,
  {
    /** The gap between children: a key of the `spacing` scale, a number of pixels or any CSS length. */
    gap?: VariableProp<typeof stackVariables, "stack-gap">;
    /** How children line up across the column, as CSS `align-items`. */
    align?: VariableProp<typeof stackVariables, "stack-align", JSX.CSSProperties["align-items"]>;
    /** How children spread down the column, as CSS `justify-content`. */
    justify?: VariableProp<
      typeof stackVariables,
      "stack-justify",
      JSX.CSSProperties["justify-content"]
    >;
  }
>;

export function Stack(props: StackProps) {
  const { root } = createParts(stackVariables, styles, props, {
    variables: { "stack-align": "align", "stack-gap": "gap", "stack-justify": "justify" },
  });
  return <div {...root} />;
}
