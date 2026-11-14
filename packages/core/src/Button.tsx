import * as stylex from "@stylexjs/stylex";
import { omit } from "solid-js";
import type { ValidComponent } from "@solidjs/web";
import { Box } from "./Box";
import { createParts, type PartProps, partPropKeys } from "./parts";
import type { PolymorphicProps } from "./style-props";
import { tokens } from "./tokens.stylex";

const styles = stylex.create({
  root: {
    backgroundColor: tokens["--solix-color-primary"],
    borderRadius: tokens["--solix-radius-md"],
    borderWidth: 0,
    color: tokens["--solix-color-on-primary"],
    cursor: "pointer",
    fontSize: "0.875rem",
    height: tokens["--solix-control-height-md"],
    paddingInline: "1rem",
  },
});

export function Button<T extends ValidComponent = "button">(
  props: PolymorphicProps<T, PartProps<typeof styles>>,
) {
  const rest = omit(props, "class", "style", "component", ...partPropKeys);
  const part = createParts("Button", styles, props);
  return <Box {...rest} component={props.component ?? "button"} {...part("root")} />;
}
