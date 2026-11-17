import * as stylex from "@stylexjs/stylex";
import { createParts, type ElementProps } from "#/src/parts.ts";
import { useTabs } from "#/src/tabs-context.ts";
import { tokens } from "#/src/tokens.stylex.ts";

const styles = stylex.create({
  root: {
    borderBlockEndColor: tokens["--solix-color-border"],
    borderBlockEndStyle: {
      default: "solid",
      '[data-orientation="vertical"]': "none",
    },
    borderBlockEndWidth: "1px",
    borderInlineEndColor: tokens["--solix-color-border"],
    borderInlineEndStyle: {
      default: "none",
      '[data-orientation="vertical"]': "solid",
    },
    borderInlineEndWidth: "1px",
    display: "flex",
    flexDirection: {
      default: "row",
      '[data-orientation="vertical"]': "column",
    },
    flexWrap: "wrap",
    gap: tokens["--solix-spacing-xs"],
  },
});

export type TabsListProps = ElementProps<"div", typeof styles>;

export function TabsList(props: TabsListProps) {
  const tabs = useTabs("Tabs.List");
  const { root } = tabs.behaviour.bind(createParts("TabsList", styles, props, "children"), {
    root: { slot: "list", own: { onKeyDown: tabs.steps.onKeyDown } },
  });
  return <div {...root}>{props.children}</div>;
}
