import * as stylex from "@stylexjs/stylex";
import { Show } from "solid-js";
import { createParts, type ElementProps } from "./parts";
import { useTabs } from "./tabs-context";
import { tokens } from "./tokens.stylex";

const styles = stylex.create({
  root: {
    color: tokens["--solix-color-text"],
    fontSize: tokens["--solix-font-size-md"],
    lineHeight: tokens["--solix-line-height-md"],
  },
});

export type TabsPanelProps = ElementProps<
  "div",
  typeof styles,
  { value: string; keepMounted?: boolean }
>;

export function TabsPanel(props: TabsPanelProps) {
  const tabs = useTabs("Tabs.Panel");
  const { root } = createParts(
    "TabsPanel",
    styles,
    props,
    tabs.behaviour.parts({
      root: [
        "panel",
        () => ({ value: props.value, keepMounted: true }),
        {
          get id() {
            const base = tabs.baseId();
            return base === undefined ? undefined : `${base}-panel-${props.value}`;
          },
        },
      ],
    }),
    "value",
    "keepMounted",
    "children",
  );
  const isShown = () => tabs.behaviour.present("panel", () => ({ value: props.value }));
  return (
    <div {...root}>
      <Show when={props.keepMounted || tabs.keepMounted() || isShown()}>{props.children}</Show>
    </div>
  );
}
