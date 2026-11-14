import * as stylex from "@stylexjs/stylex";
import { omit } from "solid-js";
import type { ComponentProps } from "@solidjs/web";
import { disclosureState } from "./disclosure-state.stylex";
import { tokens } from "./tokens.stylex";

const styles = stylex.create({
  root: {
    [disclosureState.summaryBackground]: {
      default: tokens["--solix-color-surface"],
      "[open]": tokens["--solix-color-primary"],
    },
    [disclosureState.summaryColor]: {
      default: tokens["--solix-color-text"],
      "[open]": tokens["--solix-color-on-primary"],
    },
  },
  summary: {
    backgroundColor: disclosureState.summaryBackground,
    color: disclosureState.summaryColor,
    cursor: "pointer",
    paddingBlock: "0.5rem",
    paddingInline: "1rem",
  },
  content: {
    borderInlineStartColor: tokens["--solix-color-primary"],
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: "4px",
    padding: "0.5rem",
  },
});

export function Disclosure(props: ComponentProps<"details"> & { label: string }) {
  const rest = omit(props, "class", "label", "children");
  return (
    <details
      {...rest}
      class={[stylex.attrs(styles.root).class, "solix-Disclosure-root", props.class]}
    >
      <summary class={[stylex.attrs(styles.summary).class, "solix-Disclosure-summary"]}>
        {props.label}
      </summary>
      <div class={[stylex.attrs(styles.content).class, "solix-Disclosure-content"]}>
        {props.children}
      </div>
    </details>
  );
}
