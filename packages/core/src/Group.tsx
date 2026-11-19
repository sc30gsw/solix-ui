import * as stylex from "@stylexjs/stylex";
import type { JSX } from "@solidjs/web";
import { children } from "solid-js";
import { createParts, type ElementProps } from "#/src/parts.ts";
import { rendersSomething } from "#/src/renders-something.ts";
import { variableProperty } from "#/src/style-prop-table.ts";
import type { VariableProp } from "#/src/style-props.ts";
import { tokens } from "#/src/tokens.stylex.ts";

const styles = stylex.create({
  root: {
    "--group-align": "center",
    "--group-gap": tokens["--solix-spacing-md"],
    "--group-justify": "flex-start",
    "--group-wrap": "wrap",
    alignItems: "var(--group-align)",
    display: "flex",
    flexDirection: "row",
    flexWrap: "var(--group-wrap)",
    gap: "var(--group-gap)",
    justifyContent: "var(--group-justify)",
  },
});

export type GroupProps = ElementProps<
  "div",
  typeof styles,
  {
    justify?: VariableProp<"group-justify", JSX.CSSProperties["justify-content"]>;
    align?: VariableProp<"group-align", JSX.CSSProperties["align-items"]>;
    wrap?: VariableProp<"group-wrap", JSX.CSSProperties["flex-wrap"]>;
    gap?: VariableProp<"group-gap">;
    grow?: boolean;
    preventGrowOverflow?: boolean;
  }
>;

export function Group(props: GroupProps) {
  const resolved = children(() => props.children);
  const present = () => resolved.toArray().filter(rendersSomething);
  const gap = `var(${variableProperty("group-gap")})`;
  const childWidth = () =>
    props.preventGrowOverflow === false
      ? "none"
      : `calc((100% + ${gap}) / ${present().length} - ${gap})`;
  const { root } = createParts("Group", styles, props, {
    variables: {
      "group-align": "align",
      "group-child-width": (given) => (given.grow ? childWidth() : undefined),
      "group-gap": "gap",
      "group-justify": "justify",
      "group-wrap": "wrap",
    },
    keep: ["children", "grow", "preventGrowOverflow"],
  });
  return (
    <div data-grow={props.grow ? "true" : undefined} {...root}>
      {present()}
    </div>
  );
}
