import * as stylex from "@stylexjs/stylex";
import { createParts, type ElementProps } from "./parts";
import { type ScaleValue, variables } from "./style-props";
import { tokens } from "./tokens.stylex";

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
    size?: ScaleValue<"container-size">;
    fluid?: boolean;
    strategy?: "block" | "grid";
  }
>;

export function Container(props: ContainerProps) {
  const size = () => {
    if (props.unstyled) return undefined;
    return props.fluid ? defaultSize : (props.size ?? defaultSize);
  };
  const { root } = createParts(
    "Container",
    styles,
    props,
    () => variables({ "container-size": size() }),
    "fluid",
    "size",
    "strategy",
  );
  return (
    <div
      data-fluid={props.fluid ? "true" : undefined}
      data-strategy={props.strategy ?? "block"}
      {...root}
    />
  );
}
