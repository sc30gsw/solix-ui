import { createUncontrolled } from "@solix/primitives";
import * as stylex from "@stylexjs/stylex";
import { createBehaviour, tabs } from "#/src/headless.ts";
import {
  type ControlledProps,
  createParts,
  defaultsOf,
  type ElementProps,
  withDefaults,
} from "#/src/parts.ts";
import { stepOverDisabled } from "#/src/step-over-disabled.ts";
import { TabsContext, type TabsOrientation } from "#/src/tabs-context.ts";
import { TabsList } from "#/src/TabsList.tsx";
import { TabsPanel } from "#/src/TabsPanel.tsx";
import { TabsTab } from "#/src/TabsTab.tsx";
import { tokens } from "#/src/tokens.stylex.ts";

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
  ControlledProps<string | null> & {
    orientation?: TabsOrientation;
    loop?: boolean;
    /** Selects a tab when the arrow keys, Home or End move focus to it; otherwise Enter or Space selects it. */
    activateTabWithKeyboard?: boolean;
    /** A press on the selected tab deselects it. */
    allowTabDeactivation?: boolean;
    keepMounted?: boolean;
  }
>;

const defaults = defaultsOf<TabsProps>()({
  loop: true,
  activateTabWithKeyboard: true,
  allowTabDeactivation: false,
  keepMounted: true,
});

export function Tabs(rawProps: TabsProps) {
  const props = withDefaults(defaults, rawProps);
  const [value, setValue] = createUncontrolled<string | null>({
    value: () => props.value,
    defaultValue: () => props.defaultValue,
    finalValue: null,
    onChange: (selected) => props.onChange?.(selected),
  });
  const loop = () => props.loop;
  const activateTabWithKeyboard = () => props.activateTabWithKeyboard;
  const behaviour = createBehaviour(tabs, () => ({
    value: value(),
    onValueChange: (selected: string | null) => setValue(selected),
    orientation: props.orientation,
    activation: activateTabWithKeyboard() ? ("automatic" as const) : ("manual" as const),
    loop: loop(),
  }));
  const steps = stepOverDisabled({
    items: tab,
    loop,
    activate: (selected: string) => {
      if (activateTabWithKeyboard()) behaviour.api.setValue(selected);
    },
  });
  const { root } = behaviour.bind(
    createParts("Tabs", styles, props, {
      keep: [
        "value",
        "defaultValue",
        "onChange",
        "orientation",
        "loop",
        "activateTabWithKeyboard",
        "allowTabDeactivation",
        "keepMounted",
        "children",
      ],
    }),
    { root: { slot: "root" } },
  );
  return (
    <div {...root}>
      <TabsContext
        value={{
          behaviour,
          selected: value,
          baseId: () => (typeof props.id === "string" ? props.id : undefined),
          steps,
          allowTabDeactivation: () => props.allowTabDeactivation,
          keepMounted: () => props.keepMounted,
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
