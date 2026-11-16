import * as stylex from "@stylexjs/stylex";
import { createParts, type ElementProps } from "./parts";
import { useTabs } from "./tabs-context";
import { tokens } from "./tokens.stylex";

const styles = stylex.create({
  root: {
    borderBlockEndColor: tokens["--solix-color-border"],
    borderBlockEndStyle: {
      default: "solid",
      '[data-orientation="vertical"]': "none",
    },
    borderBlockEndWidth: "1px",
    display: "flex",
    flexDirection: {
      default: "row",
      '[data-orientation="vertical"]': "column",
    },
    gap: tokens["--solix-spacing-xs"],
  },
});

export type TabsListProps = ElementProps<"div", typeof styles>;

export function TabsList(props: TabsListProps) {
  const tabs = useTabs("Tabs.List");
  const { root } = tabs.behaviour.bind(createParts("TabsList", styles, props), {
    root: { slot: "list", own: { onKeyDown: tabs.onListKeyDown } },
  });
  return <div {...root} />;
}
