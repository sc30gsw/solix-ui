import * as stylex from "@stylexjs/stylex";
import type { JSX } from "@solidjs/web";
import { children } from "solid-js";
import { createParts, type ElementProps, withDefaults } from "#/src/parts.ts";
import { groupVariables } from "#/src/Group.variables.ts";
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
    /** How children spread along the row, as CSS `justify-content`. */
    justify?: VariableProp<
      typeof groupVariables,
      "group-justify",
      JSX.CSSProperties["justify-content"]
    >;
    /** How children line up across the row, as CSS `align-items`. */
    align?: VariableProp<typeof groupVariables, "group-align", JSX.CSSProperties["align-items"]>;
    /** Whether children wrap onto new rows, as CSS `flex-wrap`. */
    wrap?: VariableProp<typeof groupVariables, "group-wrap", JSX.CSSProperties["flex-wrap"]>;
    /** The gap between children: a key of the `spacing` scale, a number of pixels or any CSS length. */
    gap?: VariableProp<typeof groupVariables, "group-gap">;
    /** Makes every child grow to an equal share of the row. */
    grow?: boolean;
    /** With `grow`, keeps each child to its share, so a long child does not push the others out; on unless set to `false`. */
    preventGrowOverflow?: boolean;
  }
>;

const defaults = { preventGrowOverflow: true } satisfies Partial<GroupProps>;

export function Group(rawProps: GroupProps) {
  const props = withDefaults(defaults, rawProps);
  const resolved = children(() => props.children);
  const present = () => resolved.toArray().filter(rendersSomething);
  const gap = `var(${variableProperty("group-gap")})`;
  const childWidth = () =>
    props.preventGrowOverflow ? `calc((100% + ${gap}) / ${present().length} - ${gap})` : "none";
  const { root } = createParts(groupVariables, styles, props, {
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
