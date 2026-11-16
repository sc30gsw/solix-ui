import { createContext, useContext } from "solid-js";
import type { Behaviour, tabs } from "./headless";
import type { SteppedList } from "./step-over-disabled";

export type TabsOrientation = "horizontal" | "vertical";

export type TabsContextValue = {
  behaviour: Behaviour<typeof tabs>;
  selected: () => string | null;
  baseId: () => string | undefined;
  steps: SteppedList<string>;
  allowTabDeactivation: () => boolean;
  keepMounted: () => boolean;
};

export const TabsContext = createContext<TabsContextValue | null>(null);

export function useTabs(part: string): TabsContextValue {
  const context = useContext(TabsContext);
  if (context === null) throw new Error(`${part} must be rendered inside Tabs.`);
  return context;
}
