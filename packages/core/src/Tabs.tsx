import { createUncontrolled } from "@solix/primitives";
import * as stylex from "@stylexjs/stylex";
import { createBehaviour, tabs } from "#/src/headless.ts";
import { createParts, type ElementProps } from "#/src/parts.ts";
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
  {
    /** The selected tab's value, which makes the selection controlled; `null` selects none. */
    value?: string | null;
    /** The tab selected at first, while the selection is uncontrolled. */
    defaultValue?: string | null;
    /** Called with the new value when the user changes the selection. */
    onChange?: (value: string | null) => void;
    /** Lays the tabs out in a row or a column; the arrow keys follow it. */
    orientation?: TabsOrientation;
    /** Lets the arrow keys wrap from the last tab to the first and back. */
    loop?: boolean;
    /** Selects a tab when the arrow keys move focus to it; otherwise Enter or Space selects it. */
    activateTabWithKeyboard?: boolean;
    /** Lets a press on the selected tab deselect it. */
    allowTabDeactivation?: boolean;
    /** Keeps every panel in the page, hidden, while its tab is not selected. */
    keepMounted?: boolean;
  }
>;

export function Tabs(props: TabsProps) {
  const [value, setValue] = createUncontrolled<string | null>({
    value: () => props.value,
    defaultValue: () => props.defaultValue,
    finalValue: null,
    onChange: (selected) => props.onChange?.(selected),
  });
  const loop = () => props.loop ?? true;
  const activateTabWithKeyboard = () => props.activateTabWithKeyboard ?? true;
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
