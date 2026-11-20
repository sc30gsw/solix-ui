import * as stylex from "@stylexjs/stylex";
import { createParts, type ElementProps } from "#/src/parts.ts";
import { containerVariables } from "#/src/Container.variables.ts";
import type { VariableProp } from "#/src/style-props.ts";
import { tokens } from "#/src/tokens.stylex.ts";

const styles = stylex.create({
  root: {
    display: {
      default: null,
      '[data-strategy="grid"]': "grid",
    },
    gridTemplateColumns: {
      default: null,
      '[data-strategy="grid"]': "1fr min(100%, var(--container-size)) 1fr",
    },
    marginInline: "auto",
    maxWidth: {
      default: "var(--container-size)",
      "[data-fluid]": "100%",
      '[data-strategy="grid"]': "none",
    },
    paddingInline: {
      default: tokens["--solix-spacing-md"],
      '[data-strategy="grid"]': 0,
    },
  },
});

const defaultSize = "md";

export type ContainerProps = ElementProps<
  "div",
  typeof styles,
  {
    /** The widest the content gets: a key of the `container-size` scale, a number of pixels or any CSS length. */
    size?: VariableProp<typeof containerVariables, "container-size">;
    /** With `strategy` `block`, takes the whole width of its parent, whatever `size` says; with `grid`, the middle column keeps the `md` width. */
    fluid?: boolean;
    /** `block` centres the content with `size` as its widest; `grid` puts it in the middle column of a grid, so a child can reach the full width. */
    strategy?: "block" | "grid";
  }
>;

export function Container(props: ContainerProps) {
  const { root } = createParts(containerVariables, styles, props, {
    variables: {
      "container-size": (given) => (given.fluid ? defaultSize : (given.size ?? defaultSize)),
    },
    keep: ["fluid", "size", "strategy"],
  });
  return (
    <div
      data-fluid={props.fluid ? "true" : undefined}
      data-strategy={props.strategy ?? "block"}
      {...root}
    />
  );
}
