import * as stylex from "@stylexjs/stylex";
import type { JSX } from "@solidjs/web";
import { createParts, type ElementProps } from "./parts";
import { type Spacing, variables } from "./style-props";
import { tokens } from "./tokens.stylex";

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
    gap?: Spacing;
    align?: JSX.CSSProperties["align-items"];
    justify?: JSX.CSSProperties["justify-content"];
  }
>;

export function Stack(props: StackProps) {
  const { root } = createParts(
    "Stack",
    styles,
    props,
    () =>
      variables({
        "stack-align": props.align,
        "stack-gap": props.gap,
        "stack-justify": props.justify,
      }),
    "align",
    "gap",
    "justify",
  );
  return <div {...root} />;
}
