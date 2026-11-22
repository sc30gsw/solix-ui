import * as stylex from "@stylexjs/stylex";
import { Show } from "solid-js";
import { partId } from "#/src/headless.ts";
import { createParts, type ElementProps } from "#/src/parts.ts";
import { useTabs } from "#/src/tabs-context.ts";
import { tokens } from "#/src/tokens.stylex.ts";

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
  {
    /** The value of the tab that shows this panel. */
    value: string;
    /** `true` keeps this panel's content mounted even when the `Tabs` do not keep panels; `false` leaves it to the `Tabs`. */
    keepMounted?: boolean;
  }
>;

export function TabsPanel(props: TabsPanelProps) {
  const tabs = useTabs("Tabs.Panel");
  const { root } = tabs.behaviour.bind(
    createParts("TabsPanel", styles, props, { keep: ["value", "keepMounted", "children"] }),
    {
      root: {
        slot: "panel",
        props: () => ({ value: props.value, keepMounted: true }),
        own: {
          get id() {
            return partId(tabs.baseId(), "panel", props.value);
          },
        },
      },
    },
  );
  const isShown = () => tabs.behaviour.present("panel", () => ({ value: props.value }));
  return (
    <div {...root}>
      <Show when={props.keepMounted || tabs.keepMounted() || isShown()}>{props.children}</Show>
    </div>
  );
}
