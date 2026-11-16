import type { Locator, Page } from "playwright";

export const tabsRegion = 'section[aria-label="Tabs"]';

export type KeyboardCase = {
  list: string;
  direction?: "rtl";
  start: string;
  keys: string[];
  focused: string;
  selected: string;
};

export const account = "Account";
export const manual = "Manual vertical";
export const vertical = "Vertical";
export const optional = "Optional";
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
  {
    list: account,
    direction: "rtl",
    start: "Overview",
    keys: ["ArrowLeft"],
    focused: "Members",
    selected: "Members",
  },
  {
    list: account,
    direction: "rtl",
    start: "Members",
    keys: ["ArrowRight"],
    focused: "Overview",
    selected: "Overview",
  },
  { list: manual, start: "Two", keys: ["ArrowDown"], focused: "Three", selected: "Two" },
  { list: manual, start: "Two", keys: ["ArrowDown", "Enter"], focused: "Three", selected: "Three" },
  { list: manual, start: "Two", keys: ["ArrowUp", " "], focused: "One", selected: "One" },
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
  { list: optional, start: "Files", keys: ["Home"], focused: "Notes", selected: "Notes" },
  { list: optional, start: "Notes", keys: ["End"], focused: "Files", selected: "Files" },
  { list: optional, start: "Files", keys: ["ArrowRight"], focused: "Notes", selected: "Notes" },
  { list: optional, start: "Notes", keys: ["ArrowLeft"], focused: "Files", selected: "Files" },
];

export type TabsSetup = {
  list: string;
  tabs: { name: string; disabled: boolean }[];
  orientation: "horizontal" | "vertical";
  loop: boolean;
  selectsOnArrow: boolean;
  deselects: boolean;
  initial: string | null;
};

function enabled(...names: string[]): TabsSetup["tabs"] {
  return names.map((name) => ({ name, disabled: false }));
}

export const tabsSetups: TabsSetup[] = [
  {
    list: account,
    tabs: [
      { name: "Overview", disabled: false },
      { name: "Billing", disabled: true },
      ...enabled("Members", "Settings"),
    ],
    orientation: "horizontal",
    loop: true,
    selectsOnArrow: true,
    deselects: false,
    initial: "Overview",
  },
  {
    list: manual,
    tabs: enabled("One", "Two", "Three"),
    orientation: "vertical",
    loop: false,
    selectsOnArrow: false,
    deselects: false,
    initial: "Two",
  },
  {
    list: vertical,
    tabs: enabled("Alpha", "Beta", "Gamma"),
    orientation: "vertical",
    loop: true,
    selectsOnArrow: true,
    deselects: false,
    initial: "Beta",
  },
  {
    list: optional,
    tabs: [
      { name: "Archive", disabled: true },
      ...enabled("Notes", "Files"),
      { name: "Trash", disabled: true },
    ],
    orientation: "horizontal",
    loop: true,
    selectsOnArrow: true,
    deselects: true,
    initial: null,
  },
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
    return {
      selected: label(tabs.find((tab) => tab.getAttribute("aria-selected") === "true")),
      focused: label(tabs.find((tab) => tab === document.activeElement)),
      tabStops: tabs.filter((tab) => tab.tabIndex === 0).map(label),
      shown: [...(root?.querySelectorAll<HTMLElement>(':scope > [role="tabpanel"]') ?? [])]
        .filter((panel) => getComputedStyle(panel).display !== "none")
        .map((panel) => panel.textContent ?? ""),
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
