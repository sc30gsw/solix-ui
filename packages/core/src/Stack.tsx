import * as stylex from "@stylexjs/stylex";
import type { JSX } from "@solidjs/web";
import { createParts, type ElementProps } from "#/src/parts.ts";
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
    gap?: VariableProp<"stack-gap">;
    align?: VariableProp<"stack-align", JSX.CSSProperties["align-items"]>;
    justify?: VariableProp<"stack-justify", JSX.CSSProperties["justify-content"]>;
  }
>;

export function Stack(props: StackProps) {
  const { root } = createParts("Stack", styles, props, {
    variables: { "stack-align": "align", "stack-gap": "gap", "stack-justify": "justify" },
  });
  return <div {...root} />;
}
