import * as stylex from "@stylexjs/stylex";
import { createParts, type ElementProps } from "#/src/parts.ts";
import { tokens } from "#/src/tokens.stylex.ts";

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

export type TextInputProps = ElementProps<"input", typeof styles, { children?: never }>;

export function TextInput(props: TextInputProps) {
  const { root } = createParts("TextInput", styles, props, { keep: ["children"] });
  return <input type="text" {...root} />;
}
