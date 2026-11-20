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
} from "#/src/sections/tabs-setups.ts";
import { type DocumentSnapshot, snapshotOfDocument } from "#/tests/support/opening.ts";
import type { RovingList } from "#/tests/support/roving-list-model.ts";

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
  setupOf,
  tabNames,
  type TabsSetup,
  tabsSetups,
  valueOf,
  vertical,
} from "#/src/sections/tabs-setups.ts";

export const tabsRegion = 'section[aria-label="Tabs"]';
export const clickMissedItsTab = "the click did not reach the tab";

const pressEvents = ["mousedown", "mouseup", "click"];

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

export type TabsReading = TabsState & {
  active: (string | null)[];
  ariaSelected: (string | null)[];
};

export function tabList(page: Page, name: string): Locator {
  return page.getByRole("tablist", { name, exact: true });
}

export function tabNamed(page: Page, list: string, name: string): Locator {
  return tabList(page, list)
    .getByRole("tab")
    .filter({ has: page.getByText(name, { exact: true }) });
}

export type TabSnapshot = {
  text: string;
  ariaSelected: string | null;
  dataActive: boolean;
  focused: boolean;
  tabIndex: number;
};

export type PanelSnapshot = { text: string; hidden: HTMLElement["hidden"]; display: string };

export type ListSnapshot = { tabs: TabSnapshot[]; panels: PanelSnapshot[] };

export type TabsSnapshot = { document: DocumentSnapshot; lists: ListSnapshot[] };

function listSnapshots(lists: Element[]): ListSnapshot[] {
  return lists.map((list) => {
    const { activeElement } = list.getRootNode() as Document | ShadowRoot;
    return {
      tabs: [...list.querySelectorAll<HTMLElement>('[role="tab"]')].map((tab) => ({
        text: tab.textContent ?? "",
        ariaSelected: tab.getAttribute("aria-selected"),
        dataActive: tab.hasAttribute("data-active"),
        focused: tab === activeElement,
        tabIndex: tab.tabIndex,
      })),
      panels: [
        ...(list.parentElement?.querySelectorAll<HTMLElement>(':scope > [role="tabpanel"]') ?? []),
      ].map((panel) => ({
        text: panel.textContent ?? "",
        hidden: panel.hidden,
        display: getComputedStyle(panel).display,
      })),
    };
  });
}

export async function snapshotOf(page: Page, list: string): Promise<TabsSnapshot> {
  return {
    lists: await tabList(page, list).evaluateAll(listSnapshots),
    document: await snapshotOfDocument(page),
  };
}

export function stateFrom(
  snapshot: TabsSnapshot,
  list: string,
  names: readonly string[] = tabNamesOf(list),
): TabsReading {
  const [found, ...more] = snapshot.lists;
  if (found === undefined || more.length > 0) {
    throw new Error(
      `${list}: the page renders ${snapshot.lists.length} lists of tabs by that name, not one.`,
    );
  }
  if (found.tabs.length !== names.length) {
    throw new Error(
      `${list}: the page renders ${found.tabs.length} tabs, and the setup names ${names.length}.`,
    );
  }
  const nameAt = (index: number) => names[index] ?? null;
  const indexesWhere = (holds: (tab: TabSnapshot) => boolean) =>
    found.tabs.flatMap((tab, index) => (holds(tab) ? [index] : []));
  return {
    selected: nameAt(found.tabs.findIndex(({ ariaSelected }) => ariaSelected === "true")),
    focused: nameAt(found.tabs.findIndex(({ focused }) => focused)),
    tabStops: indexesWhere(({ tabIndex }) => tabIndex === 0).map(nameAt),
    shown: found.panels.filter(({ display }) => display !== "none").map(({ text }) => text),
    active: indexesWhere(({ dataActive }) => dataActive).map(nameAt),
    ariaSelected: indexesWhere(({ ariaSelected }) => ariaSelected === "true").map(nameAt),
  };
}

export async function stateOf(
  page: Page,
  list: string,
  names: readonly string[] = tabNamesOf(list),
): Promise<TabsState> {
  const { selected, focused, tabStops, shown } = stateFrom(
    await snapshotOf(page, list),
    list,
    names,
  );
  return { selected, focused, tabStops, shown };
}

export async function clickTab(page: Page, list: string, name: string): Promise<void> {
  const tab = tabNamed(page, list, name);
  const watch = await tab.evaluateHandle((node, types) => {
    const seen: string[] = [];
    let reached = false;
    const note = (event: Event) => {
      const { type, target } = event;
      const onTheTab = target instanceof Node && node.contains(target);
      const where =
        target instanceof Element
          ? `<${target.localName}${target.id ? ` id="${target.id}"` : ""}${target.getAttribute("role") ? ` role="${target.getAttribute("role")}"` : ""}> "${(target.textContent ?? "").trim().slice(0, 30)}"`
          : "no element";
      const at = event instanceof MouseEvent ? ` at (${event.clientX}, ${event.clientY})` : "";
      seen.push(
        `${type} on ${onTheTab ? "the tab" : where}${at} with the page scrolled to ${window.scrollY}`,
      );
      reached ||= type === "click" && onTheTab;
    };
    for (const type of types) window.addEventListener(type, note, true);
    return {
      end: () => {
        for (const type of types) window.removeEventListener(type, note, true);
        return { reached, seen };
      },
    };
  }, pressEvents);
  await tab.click();
  const { reached, seen } = await watch.evaluate(({ end }) => end());
  await watch.dispose();
  if (!reached) {
    throw new Error(
      `${list}: ${clickMissedItsTab} ${name}. The page saw ${seen.join(", ") || "no event of the press"}.`,
    );
  }
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
