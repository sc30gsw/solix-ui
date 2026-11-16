import * as stylex from "@stylexjs/stylex";
import { createSignal, untrack } from "solid-js";
import { createBehaviour, tabs } from "./headless";
import { createParts, type ElementProps } from "./parts";
import { TabsContext, type TabsOrientation } from "./tabs-context";
import { TabsList } from "./TabsList";
import { TabsPanel } from "./TabsPanel";
import { TabsTab } from "./TabsTab";
import { tokens } from "./tokens.stylex";

const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: {
      default: "column",
      '[data-orientation="vertical"]': "row",
    },
    gap: tokens["--solix-spacing-md"],
  },
});

export type TabsProps = ElementProps<
  "div",
  typeof styles,
  {
    value?: string | null;
    defaultValue?: string | null;
    onChange?: (value: string | null) => void;
    orientation?: TabsOrientation;
    loop?: boolean;
    activateTabWithKeyboard?: boolean;
    allowTabDeactivation?: boolean;
    keepMounted?: boolean;
  }
>;

export function Tabs(props: TabsProps) {
  const [uncontrolled, setUncontrolled] = createSignal(untrack(() => props.defaultValue) ?? null);
  const behaviour = createBehaviour(tabs, () => ({
    value: props.value === undefined ? uncontrolled() : props.value,
    onValueChange: (value: string | null) => {
      setUncontrolled(value);
      props.onChange?.(value);
    },
    orientation: props.orientation,
    activation:
      props.activateTabWithKeyboard === false ? ("manual" as const) : ("automatic" as const),
    loop: props.loop,
  }));
  const { root } = createParts(
    "Tabs",
    styles,
    props,
    behaviour.parts({ root: "root" }),
    "value",
    "defaultValue",
    "onChange",
    "orientation",
    "loop",
    "activateTabWithKeyboard",
    "allowTabDeactivation",
    "keepMounted",
    "children",
  );
  return (
    <div {...root}>
      <TabsContext
        value={{
          behaviour,
          baseId: () => (typeof props.id === "string" ? props.id : undefined),
          orientation: () => props.orientation ?? "horizontal",
          loop: () => props.loop ?? true,
          activateTabWithKeyboard: () => props.activateTabWithKeyboard ?? true,
          allowTabDeactivation: () => props.allowTabDeactivation ?? false,
          keepMounted: () => props.keepMounted ?? true,
        }}
      >
        {props.children}
      </TabsContext>
    </div>
  );
}

Tabs.List = TabsList;
Tabs.Tab = TabsTab;
Tabs.Panel = TabsPanel;
