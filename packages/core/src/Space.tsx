import * as stylex from "@stylexjs/stylex";
import { declarable } from "#/src/css-syntax.ts";
import { createParts, type ElementProps } from "#/src/parts.ts";
import { spaceVariables } from "#/src/Space.variables.ts";

const styles = stylex.create({
  root: {
    "--space-min-height": "initial",
    "--space-min-width": "initial",
    minHeight: "var(--space-min-height)",
    minWidth: "var(--space-min-width)",
  },
});

export type SpaceProps = ElementProps<"div", typeof styles>;

export function Space(props: SpaceProps) {
  const { root } = createParts(spaceVariables, styles, props, {
    variables: {
      "space-min-height": (given) => declarable(given.mih) ?? given.h,
      "space-min-width": (given) => declarable(given.miw) ?? given.w,
    },
  });
  return <div {...root} />;
}
