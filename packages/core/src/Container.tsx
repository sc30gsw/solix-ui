import * as stylex from "@stylexjs/stylex";
import { createParts, defaultsOf, type ElementProps, withDefaults } from "#/src/parts.ts";
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

export type ContainerProps = ElementProps<
  "div",
  typeof styles,
  {
    size?: VariableProp<typeof containerVariables, "container-size">;
    /** With `strategy` `block`, takes the whole width of its parent, whatever `size` says; with `grid`, the middle column keeps the `md` width. */
    fluid?: boolean;
    /** `block` centres the content with `size` as its widest; `grid` puts each child in the middle column of a grid, and a child with `data-breakout` spans the full width. */
    strategy?: "block" | "grid";
  }
>;

const fluidGridSize = "md";
const defaults = defaultsOf<ContainerProps>()({ size: "md", strategy: "block" });

export function Container(rawProps: ContainerProps) {
  const props = withDefaults(defaults, rawProps);
  const { root } = createParts(containerVariables, styles, props, {
    variables: {
      "container-size": (given) => (given.fluid ? fluidGridSize : given.size),
    },
    keep: ["fluid", "size", "strategy"],
  });
  return (
    <div data-fluid={props.fluid ? "true" : undefined} data-strategy={props.strategy} {...root} />
  );
}
