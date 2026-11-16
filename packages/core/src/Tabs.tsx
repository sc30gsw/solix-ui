import * as stylex from "@stylexjs/stylex";
import { createSignal, untrack } from "solid-js";
import { createBehaviour, tabs } from "./headless";
import { createParts, type ElementProps } from "./parts";
import { stepOverDisabled } from "./step-over-disabled";
import { TabsContext, type TabsOrientation } from "./tabs-context";
import { TabsList } from "./TabsList";
import { TabsPanel } from "./TabsPanel";
import { TabsTab } from "./TabsTab";
import { tokens } from "./tokens.stylex";

const tab = '[role="tab"]';

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
  const loop = () => props.loop ?? true;
  const activateTabWithKeyboard = () => props.activateTabWithKeyboard ?? true;
  const behaviour = createBehaviour(tabs, () => ({
    value: props.value === undefined ? uncontrolled() : props.value,
    onValueChange: (value: string | null) => {
      setUncontrolled(value);
      props.onChange?.(value);
    },
    orientation: props.orientation,
    activation: activateTabWithKeyboard() ? ("automatic" as const) : ("manual" as const),
    loop: loop(),
  }));
  const valueOfTab = new WeakMap<Element, () => string>();
  const { root } = behaviour.bind(
    createParts(
      "Tabs",
      styles,
      props,
      "value",
      "defaultValue",
      "onChange",
      "orientation",
      "loop",
      "activateTabWithKeyboard",
      "allowTabDeactivation",
      "keepMounted",
      "children",
    ),
    { root: { slot: "root" } },
  );
  return (
    <div {...root}>
      <TabsContext
        value={{
          behaviour,
          baseId: () => (typeof props.id === "string" ? props.id : undefined),
          valueOfTab,
          onListKeyDown: (event) =>
            stepOverDisabled(event, {
              items: tab,
              loop: loop(),
              activate: (focused) => {
                const value = valueOfTab.get(focused);
                if (activateTabWithKeyboard() && value !== undefined)
                  behaviour.api.setValue(value());
              },
            }),
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
