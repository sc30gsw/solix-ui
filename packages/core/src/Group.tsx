import * as stylex from "@stylexjs/stylex";
import type { JSX } from "@solidjs/web";
import { children } from "solid-js";
import { createParts, type ElementProps } from "./parts";
import { type Spacing, variables } from "./style-props";
import { tokens } from "./tokens.stylex";

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
    justify?: JSX.CSSProperties["justify-content"];
    align?: JSX.CSSProperties["align-items"];
    wrap?: JSX.CSSProperties["flex-wrap"];
    gap?: Spacing;
    grow?: boolean;
    preventGrowOverflow?: boolean;
  }
>;

function rendersSomething(child: unknown): boolean {
  return child !== true && Boolean(child);
}

export function Group(props: GroupProps) {
  const resolved = children(() => props.children);
  const present = () => resolved.toArray().filter(rendersSomething);
  const childWidth = () =>
    props.preventGrowOverflow === false
      ? "none"
      : `calc((100% + var(--group-gap)) / ${present().length} - var(--group-gap))`;
  const { root } = createParts(
    "Group",
    styles,
    props,
    () =>
      variables({
        "group-align": props.align,
        "group-child-width": props.grow && !props.unstyled ? childWidth() : undefined,
        "group-gap": props.gap,
        "group-justify": props.justify,
        "group-wrap": props.wrap,
      }),
    "align",
    "children",
    "gap",
    "grow",
    "justify",
    "preventGrowOverflow",
    "wrap",
  );
  return (
    <div data-grow={props.grow ? "true" : undefined} {...root}>
      {present()}
    </div>
  );
}
