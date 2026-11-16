import type { Locator, Page } from "playwright";
import {
  account,
  manual,
  optional,
  rightToLeft,
  vertical,
} from "../../src/sections/tabs-setups.ts";

export {
  account,
  manual,
  optional,
  panelOf,
  rightToLeft,
  type TabsSetup,
  tabsSetups,
  vertical,
} from "../../src/sections/tabs-setups.ts";

export const tabsRegion = 'section[aria-label="Tabs"]';

export type KeyboardCase = {
  list: string;
  start: string;
  keys: string[];
  focused: string;
  selected: string;
};

export const keyboardTable: KeyboardCase[] = [
  {
    list: account,
    start: "Overview",
    keys: ["ArrowRight"],
    focused: "Members",
    selected: "Members",
  },
  {
    list: account,
    start: "Members",
    keys: ["ArrowLeft"],
    focused: "Overview",
    selected: "Overview",
  },
  {
    list: account,
    start: "Overview",
    keys: ["ArrowLeft"],
    focused: "Settings",
    selected: "Settings",
  },
  {
    list: account,
    start: "Settings",
    keys: ["ArrowRight"],
    focused: "Overview",
    selected: "Overview",
  },
  { list: account, start: "Members", keys: ["Home"], focused: "Overview", selected: "Overview" },
  { list: account, start: "Overview", keys: ["End"], focused: "Settings", selected: "Settings" },
  { list: account, start: "Members", keys: ["ArrowDown"], focused: "Members", selected: "Members" },
  { list: account, start: "Members", keys: ["ArrowUp"], focused: "Members", selected: "Members" },
  {
    list: account,
    start: "Overview",
    keys: ["ArrowRight", "ArrowRight"],
    focused: "Settings",
    selected: "Settings",
  },
  { list: rightToLeft, start: "North", keys: ["ArrowLeft"], focused: "South", selected: "South" },
  { list: rightToLeft, start: "South", keys: ["ArrowRight"], focused: "North", selected: "North" },
  { list: rightToLeft, start: "North", keys: ["ArrowRight"], focused: "West", selected: "West" },
  { list: rightToLeft, start: "West", keys: ["ArrowLeft"], focused: "North", selected: "North" },
  { list: rightToLeft, start: "South", keys: ["Home"], focused: "North", selected: "North" },
  { list: rightToLeft, start: "South", keys: ["End"], focused: "West", selected: "West" },
  { list: manual, start: "Two", keys: ["ArrowDown"], focused: "Three", selected: "Two" },
  { list: manual, start: "Two", keys: ["ArrowDown", "Enter"], focused: "Three", selected: "Three" },
  { list: manual, start: "Two", keys: ["ArrowUp", "Space"], focused: "One", selected: "One" },
  { list: manual, start: "Three", keys: ["ArrowDown"], focused: "Three", selected: "Three" },
  { list: manual, start: "One", keys: ["ArrowUp"], focused: "One", selected: "One" },
  { list: manual, start: "Two", keys: ["ArrowRight"], focused: "Two", selected: "Two" },
  { list: manual, start: "Two", keys: ["Home"], focused: "One", selected: "Two" },
  { list: manual, start: "Two", keys: ["End"], focused: "Three", selected: "Two" },
  { list: vertical, start: "Beta", keys: ["ArrowUp"], focused: "Alpha", selected: "Alpha" },
  { list: vertical, start: "Alpha", keys: ["ArrowUp"], focused: "Gamma", selected: "Gamma" },
  { list: vertical, start: "Gamma", keys: ["ArrowDown"], focused: "Alpha", selected: "Alpha" },
  { list: vertical, start: "Alpha", keys: ["ArrowDown"], focused: "Beta", selected: "Beta" },
  { list: vertical, start: "Beta", keys: ["ArrowLeft"], focused: "Beta", selected: "Beta" },
  { list: vertical, start: "Alpha", keys: ["End"], focused: "Gamma", selected: "Gamma" },
  { list: optional, start: "Files", keys: ["Home"], focused: "Notes", selected: "Notes" },
  { list: optional, start: "Notes", keys: ["End"], focused: "Files", selected: "Files" },
  { list: optional, start: "Files", keys: ["ArrowRight"], focused: "Notes", selected: "Notes" },
  { list: optional, start: "Notes", keys: ["ArrowLeft"], focused: "Files", selected: "Files" },
];

export type TabsState = {
  selected: string | null;
  focused: string | null;
  shown: string[];
  tabStops: (string | null)[];
};

export function tabList(page: Page, name: string): Locator {
  return page.getByRole("tablist", { name, exact: true });
}

export function tabNamed(page: Page, list: string, name: string): Locator {
  return tabList(page, list)
    .getByRole("tab")
    .filter({ has: page.getByText(name, { exact: true }) });
}

export function stateOf(page: Page, list: string): Promise<TabsState> {
  return tabList(page, list).evaluate((node) => {
    const tabs = [...node.querySelectorAll<HTMLElement>('[role="tab"]')];
    const label = (tab: HTMLElement | undefined) =>
      tab?.querySelector('[class*="-label"]')?.textContent ?? null;
    const root = node.parentElement;
    const { activeElement } = node.getRootNode() as Document | ShadowRoot;
    return {
      selected: label(tabs.find((tab) => tab.getAttribute("aria-selected") === "true")),
      focused: label(tabs.find((tab) => tab === activeElement)),
      tabStops: tabs.filter((tab) => tab.tabIndex === 0).map(label),
      shown: [...(root?.querySelectorAll<HTMLElement>(':scope > [role="tabpanel"]') ?? [])]
        .filter((panel) => getComputedStyle(panel).display !== "none")
        .map((panel) => panel.textContent ?? ""),
    };
  });
}

export function activeAndSelected(
  page: Page,
  list: string,
): Promise<{ active: number[]; selected: number[] }> {
  return tabList(page, list).evaluate((node) => {
    const tabs = [...node.querySelectorAll('[role="tab"]')];
    const indexesWhere = (holds: (tab: Element) => boolean) =>
      tabs.flatMap((tab, index) => (holds(tab) ? [index] : []));
    return {
      active: indexesWhere((tab) => tab.hasAttribute("data-active")),
      selected: indexesWhere((tab) => tab.getAttribute("aria-selected") === "true"),
    };
  });
}

export async function startAt(page: Page, list: string, name: string): Promise<void> {
  const tab = tabNamed(page, list, name);
  if ((await stateOf(page, list)).selected === name) await tab.focus();
  else await tab.click();
}

export function sdkStyles(page: Page, layer: string): Promise<string[]> {
  return page.evaluate(
    (opening) =>
      [...document.querySelectorAll("style")]
        .map((style) => style.textContent ?? "")
        .filter((css) => css.startsWith(opening)),
    `@layer ${layer} {`,
  );
}

export type Named = { tab: string[][]; panel: string[][] };

export function elementsNamedBy(page: Page, list: string): Promise<Named[]> {
  return tabList(page, list).evaluate((node) => {
    const tabs = [...node.querySelectorAll('[role="tab"]')];
    const panels = [...(node.parentElement?.querySelectorAll(':scope > [role="tabpanel"]') ?? [])];
    const named = (from: Element | undefined, attribute: string, wanted: Element | undefined) =>
      (from?.getAttribute(attribute) ?? "")
        .split(/[\t\n\f\r ]+/)
        .filter((id) => id !== "")
        .map((id) =>
          [...document.querySelectorAll("[id]")]
            .filter((element) => element.id === id)
            .map((element) => (element === wanted ? "its own" : element.outerHTML)),
        );
    return tabs.map((tab, index) => ({
      tab: named(tab, "aria-controls", panels[index]),
      panel: named(panels[index], "aria-labelledby", tab),
    }));
  });
}
