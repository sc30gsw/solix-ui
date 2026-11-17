import type { Locator, Page } from "playwright";
import {
  account,
  manual,
  optional,
  rightToLeft,
  tabNames,
  tabNamesOf,
  type TabsSetup,
  tabsSetups,
  vertical,
} from "../../src/sections/tabs-setups.ts";
import type { RovingList } from "./roving-list-model.ts";

export {
  account,
  controlled,
  displayedByTheApp,
  generated,
  held,
  inAShadowRoot,
  manual,
  optional,
  panelOf,
  rightToLeft,
  tabNames,
  type TabsSetup,
  tabsSetups,
  valueOf,
  vertical,
} from "../../src/sections/tabs-setups.ts";

export const tabsRegion = 'section[aria-label="Tabs"]';

export function rovingListOf(setup: TabsSetup): RovingList {
  return {
    name: setup.list,
    items: setup.tabs,
    orientation: setup.orientation,
    direction: setup.direction,
    loop: setup.loop,
    selectsOnMove: setup.selectsOnArrow,
    deselects: setup.deselects,
    initial: setup.initial,
  };
}

export const tabLists: RovingList[] = tabsSetups.map(rovingListOf);

export type KeyboardCase = {
  list: string;
  start: string;
  keys: string[];
  focused: string;
  selected: string;
};

const { overview, members, security } = tabNames.account;
const { one, two, three } = tabNames.manual;
const { alpha, beta, gamma } = tabNames.vertical;
const { notes, files } = tabNames.optional;
const { north, south, west } = tabNames.rightToLeft;

export const keyboardTable: KeyboardCase[] = [
  {
    list: account,
    start: overview,
    keys: ["ArrowRight"],
    focused: members,
    selected: members,
  },
  {
    list: account,
    start: members,
    keys: ["ArrowLeft"],
    focused: overview,
    selected: overview,
  },
  {
    list: account,
    start: overview,
    keys: ["ArrowLeft"],
    focused: security,
    selected: security,
  },
  {
    list: account,
    start: security,
    keys: ["ArrowRight"],
    focused: overview,
    selected: overview,
  },
  { list: account, start: members, keys: ["Home"], focused: overview, selected: overview },
  { list: account, start: overview, keys: ["End"], focused: security, selected: security },
  { list: account, start: members, keys: ["ArrowDown"], focused: members, selected: members },
  { list: account, start: members, keys: ["ArrowUp"], focused: members, selected: members },
  {
    list: account,
    start: overview,
    keys: ["ArrowRight", "ArrowRight"],
    focused: security,
    selected: security,
  },
  { list: rightToLeft, start: north, keys: ["ArrowLeft"], focused: south, selected: south },
  { list: rightToLeft, start: south, keys: ["ArrowRight"], focused: north, selected: north },
  { list: rightToLeft, start: north, keys: ["ArrowRight"], focused: west, selected: west },
  { list: rightToLeft, start: west, keys: ["ArrowLeft"], focused: north, selected: north },
  { list: rightToLeft, start: south, keys: ["Home"], focused: north, selected: north },
  { list: rightToLeft, start: south, keys: ["End"], focused: west, selected: west },
  { list: manual, start: two, keys: ["ArrowDown"], focused: three, selected: two },
  { list: manual, start: two, keys: ["ArrowDown", "Enter"], focused: three, selected: three },
  { list: manual, start: two, keys: ["ArrowUp", "Space"], focused: one, selected: one },
  { list: manual, start: three, keys: ["ArrowDown"], focused: three, selected: three },
  { list: manual, start: one, keys: ["ArrowUp"], focused: one, selected: one },
  { list: manual, start: two, keys: ["ArrowRight"], focused: two, selected: two },
  { list: manual, start: two, keys: ["Home"], focused: one, selected: two },
  { list: manual, start: two, keys: ["End"], focused: three, selected: two },
  { list: vertical, start: beta, keys: ["ArrowUp"], focused: alpha, selected: alpha },
  { list: vertical, start: alpha, keys: ["ArrowUp"], focused: gamma, selected: gamma },
  { list: vertical, start: gamma, keys: ["ArrowDown"], focused: alpha, selected: alpha },
  { list: vertical, start: alpha, keys: ["ArrowDown"], focused: beta, selected: beta },
  { list: vertical, start: beta, keys: ["ArrowLeft"], focused: beta, selected: beta },
  { list: vertical, start: alpha, keys: ["End"], focused: gamma, selected: gamma },
  { list: optional, start: files, keys: ["Home"], focused: notes, selected: notes },
  { list: optional, start: notes, keys: ["End"], focused: files, selected: files },
  { list: optional, start: files, keys: ["ArrowRight"], focused: notes, selected: notes },
  { list: optional, start: notes, keys: ["ArrowLeft"], focused: files, selected: files },
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

export async function stateOf(
  page: Page,
  list: string,
  names: readonly string[] = tabNamesOf(list),
): Promise<TabsState> {
  const found = await tabList(page, list).evaluate((node) => {
    const tabs = [...node.querySelectorAll<HTMLElement>('[role="tab"]')];
    const root = node.parentElement;
    const { activeElement } = node.getRootNode() as Document | ShadowRoot;
    return {
      count: tabs.length,
      selected: tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true"),
      focused: tabs.findIndex((tab) => tab === activeElement),
      tabStops: tabs.flatMap((tab, index) => (tab.tabIndex === 0 ? [index] : [])),
      shown: [...(root?.querySelectorAll<HTMLElement>(':scope > [role="tabpanel"]') ?? [])]
        .filter((panel) => getComputedStyle(panel).display !== "none")
        .map((panel) => panel.textContent ?? ""),
    };
  });
  if (found.count !== names.length) {
    throw new Error(
      `${list}: the page renders ${found.count} tabs, and the setup names ${names.length}.`,
    );
  }
  const nameAt = (index: number) => names[index] ?? null;
  return {
    selected: nameAt(found.selected),
    focused: nameAt(found.focused),
    tabStops: found.tabStops.map(nameAt),
    shown: found.shown,
  };
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
