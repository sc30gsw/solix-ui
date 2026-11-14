import * as stylex from "@stylexjs/stylex";
import { omit } from "solid-js";
import { Box } from "./Box";
import { createParts, type PartProps, partPropKeys } from "./parts";
import type { ElementProps } from "./style-props";
import { tokens } from "./tokens.stylex";

const styles = stylex.create({
  root: {
    backgroundColor: tokens["--solix-color-body"],
    borderColor: {
      default: tokens["--solix-color-border"],
      ":focus-visible": tokens["--solix-color-primary"],
      ":user-invalid": tokens["--solix-color-error"],
    },
    borderRadius: tokens["--solix-radius-md"],
    borderStyle: "solid",
    borderWidth: "1px",
    color: tokens["--solix-color-text"],
    cursor: {
      default: "text",
      ":disabled": "not-allowed",
    },
    fontSize: "0.875rem",
    height: tokens["--solix-control-height-md"],
    opacity: {
      default: 1,
      ":disabled": 0.6,
    },
    paddingInline: "0.75rem",
  },
});

export function TextInput(props: ElementProps<"input", PartProps<typeof styles>>) {
  const rest = omit(props, "class", "style", ...partPropKeys);
  const part = createParts("TextInput", styles, props);
  return <Box type="text" {...rest} component="input" {...part("root")} />;
}
