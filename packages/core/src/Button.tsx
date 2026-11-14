import * as stylex from "@stylexjs/stylex";
import { omit } from "solid-js";
import type { ComponentProps } from "@solidjs/web";
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

export function Button(props: ComponentProps<"button">) {
  const rest = omit(props, "class");
  return (
    <button {...rest} class={[stylex.attrs(styles.root).class, "solix-Button-root", props.class]} />
  );
}
