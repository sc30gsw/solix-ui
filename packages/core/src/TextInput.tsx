import * as stylex from "@stylexjs/stylex";
import { omit } from "solid-js";
import type { ComponentProps } from "@solidjs/web";
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
    cursor: {
      default: "text",
      ":disabled": "not-allowed",
    },
    fontSize: "0.875rem",
    height: "2.25rem",
    opacity: {
      default: 1,
      ":disabled": 0.6,
    },
    paddingInline: "0.75rem",
  },
});

export function TextInput(props: ComponentProps<"input">) {
  const rest = omit(props, "class");
  return (
    <input
      type="text"
      {...rest}
      class={[stylex.attrs(styles.root).class, "solix-TextInput-root", props.class]}
    />
  );
}
