import * as stylex from "@stylexjs/stylex";
import { disclosureState } from "./disclosure-state.stylex";
import { createParts, type PartProps } from "./parts";
import type { ElementProps } from "./style-props";
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

export type DisclosureProps = ElementProps<"details", PartProps<typeof styles> & { label: string }>;

export function Disclosure(props: DisclosureProps) {
  const { root, part } = createParts("Disclosure", styles, props, "label", "children");
  return (
    <details {...root}>
      <summary {...part("summary")}>{props.label}</summary>
      <div {...part("content")}>{props.children}</div>
    </details>
  );
}
