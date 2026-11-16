import * as stylex from "@stylexjs/stylex";
import { createParts, type ElementProps } from "./parts";
import { useTabs } from "./tabs-context";
import { stepOverDisabledTabs } from "./tabs-keyboard";
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
  const { root } = createParts(
    "TabsList",
    styles,
    props,
    tabs.behaviour.parts({
      root: [
        "list",
        () => ({}),
        {
          onKeyDown: (event: KeyboardEvent & { currentTarget: HTMLElement }) =>
            stepOverDisabledTabs(event, {
              orientation: tabs.orientation(),
              loop: tabs.loop(),
              selects: tabs.activateTabWithKeyboard(),
            }),
        },
      ],
    }),
  );
  return <div {...root} />;
}
