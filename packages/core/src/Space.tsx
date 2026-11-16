import * as stylex from "@stylexjs/stylex";
import { createParts, type ElementProps } from "./parts";
import { variables } from "./style-props";

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
  const { root } = createParts("Space", styles, props, () =>
    variables({
      "space-min-height": props.mih ?? props.h,
      "space-min-width": props.miw ?? props.w,
    }),
  );
  return <div {...root} />;
}
