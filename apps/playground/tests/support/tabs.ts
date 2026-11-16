import type { Locator, Page } from "playwright";

export const tabsRegion = 'section[aria-label="Tabs"]';

export type TabsState = { selected: string | null; focused: string | null; shown: string[] };

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
