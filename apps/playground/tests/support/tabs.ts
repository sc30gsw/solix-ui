import type { Locator, Page } from "playwright";
import { tabNamesOf, type TabsSetup, tabsSetups } from "#/src/sections/tabs-setups.ts";
import { type DocumentSnapshot, snapshotOfDocument } from "#/tests/support/opening.ts";
import {
  afterClick,
  afterKey,
  indexIn,
  type Key,
  named,
  type RovingList,
  rovingListOf,
} from "#/tests/support/formal.ts";

export {
  account,
  type ControlledSetup,
  controlled,
  controlledSetupOf,
  displayedByTheApp,
  generated,
  held,
  inAShadowRoot,
  keyboardTable,
  manual,
  optional,
  panelOf,
  setupOf,
  tabNames,
  tabNamesOf,
  type TabsSetup,
  tabsSetups,
  valueOf,
  vertical,
} from "#/src/sections/tabs-setups.ts";

export const tabsRegion = 'section[aria-label="Tabs"]';
export const clickMissedItsTab = "the click did not reach the tab";

const pressEvents = ["mousedown", "mouseup", "click"];

export type NamedRovingList = { name: string; names: string[]; list: RovingList };

export type NamedSelection = { selected: string | null; focused: string | null };

function namedListOf(setup: TabsSetup): NamedRovingList {
  return { name: setup.list, names: tabNamesOf(setup.list), list: rovingListOf(setup) };
}

export const namedLists: NamedRovingList[] = tabsSetups.map(namedListOf);

function indexesOf({ names }: NamedRovingList, state: NamedSelection) {
  return { selected: indexIn(names, state.selected), focused: indexIn(names, state.focused) };
}

function namesOf(
  { names }: NamedRovingList,
  state: { selected: number | null; focused: number | null },
) {
  return { selected: named(names, state.selected), focused: named(names, state.focused) };
}

export function afterClickByName(
  list: NamedRovingList,
  state: NamedSelection,
  name: string,
): NamedSelection {
  const tab = indexIn(list.names, name);
  if (tab === null) throw new Error(`${list.name}: a click needs a tab.`);
  return namesOf(list, afterClick(list.list, indexesOf(list, state), tab));
}

export function afterKeyByName(
  list: NamedRovingList,
  state: NamedSelection,
  key: Key,
): NamedSelection {
  return namesOf(list, afterKey(list.list, indexesOf(list, state), key));
}

type TabsState = {
  selected: string | null;
  focused: string | null;
  shown: string[];
  tabStops: (string | null)[];
};

type TabsReading = TabsState & {
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

type TabSnapshot = {
  text: string;
  ariaSelected: string | null;
  dataActive: boolean;
  focused: boolean;
  tabIndex: number;
};

type PanelSnapshot = { text: string; hidden: HTMLElement["hidden"]; display: string };

type ListSnapshot = { tabs: TabSnapshot[]; panels: PanelSnapshot[] };

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

function listsOf(page: Page, list: string): Promise<ListSnapshot[]> {
  return tabList(page, list).evaluateAll(listSnapshots);
}

export async function snapshotOf(page: Page, list: string): Promise<TabsSnapshot> {
  return { lists: await listsOf(page, list), document: await snapshotOfDocument(page) };
}

export function stateFrom(
  lists: readonly ListSnapshot[],
  list: string,
  names: readonly string[] = tabNamesOf(list),
): TabsReading {
  const [found, ...more] = lists;
  if (found === undefined || more.length > 0) {
    throw new Error(
      `${list}: the page renders ${lists.length} lists of tabs by that name, not one.`,
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
  const { selected, focused, tabStops, shown } = stateFrom(await listsOf(page, list), list, names);
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

type Named = { tab: string[][]; panel: string[][] };

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
