import * as stylex from "@stylexjs/stylex";
import { disclosureState } from "#/src/disclosure-state.stylex.ts";
import { createParts, type ElementProps } from "#/src/parts.ts";
import { primaryColors } from "#/src/primary-colors.stylex.ts";
import { tokens } from "#/src/tokens.stylex.ts";

const styles = stylex.create({
  root: {
    [disclosureState.summaryBackground]: {
      default: tokens["--solix-color-surface"],
      "[open]": primaryColors["--solix-primary-6"],
    },
    [disclosureState.summaryColor]: {
      default: tokens["--solix-color-text"],
      "[open]": primaryColors["--solix-primary-contrast"],
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
    borderInlineStartColor: primaryColors["--solix-primary-6"],
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: "4px",
    padding: "0.5rem",
  },
});

export type DisclosureProps = ElementProps<"details", typeof styles, { label: string }>;

export function Disclosure(props: DisclosureProps) {
  const { root, part } = createParts("Disclosure", styles, props, { keep: ["label", "children"] });
  return (
    <details {...root}>
      <summary {...part("summary")}>{props.label}</summary>
      <div {...part("content")}>{props.children}</div>
    </details>
  );
}
