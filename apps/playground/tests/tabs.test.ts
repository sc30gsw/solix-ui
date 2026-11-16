import { join } from "node:path";
import type { Locator } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, test } from "vite-plus/test";
import { baseKey, stylePropClass } from "../../../packages/core/src/style-prop-table";
import { rootPart, stableClass } from "../../../packages/core/tests/built-library";
import { computed, inEveryEngine, openPage, type OpenPage } from "./support/playground";
import {
  account,
  controlled,
  displayedByTheApp,
  elementsNamedBy,
  generated,
  held,
  manual,
  optional,
  panelOf,
  stateOf,
  tabList,
  tabNamed,
  tabsRegion,
  tabsSetups,
  vertical,
} from "./support/tabs";
import { pathBetween, singleSteps } from "./support/tabs-model";

const url = inject("playgroundUrl");
const axeSource = join(import.meta.dirname, "../../../node_modules/axe-core/axe.min.js");
const wcag22LevelAOrAA = /^wcag2\d?a{1,2}$/;

inEveryEngine((browser) => {
  describe("Tabs before any script runs", () => {
    let opened: OpenPage;

    beforeAll(async () => {
      opened = await openPage(browser(), url, { javaScriptEnabled: false });
    });

    afterAll(async () => {
      await opened.close();
    });

    test("arrive with the default tab selected, its panel shown and every other panel hidden, by the library's own stylesheet, a panel that a style prop, the consumer's style or the consumer's class gives a display included", async () => {
      const { page } = opened;

      expect(await stateOf(page, account)).toEqual({
        selected: "Overview",
        focused: null,
        shown: ["Overview panel"],
        tabStops: ["Overview"],
      });
      expect(await stateOf(page, optional)).toMatchObject({
        selected: null,
        focused: null,
        shown: [],
      });
      expect(await page.getByText("Members panel").getAttribute("class")).toContain(
        stylePropClass("display", baseKey),
      );
      expect(await stateOf(page, held)).toMatchObject({ shown: ["Kept panel"] });
      expect(await page.getByText("Styled panel").getAttribute("style")).toBe(
        displayedByTheApp.style,
      );
      expect(await page.getByText("Classed panel").getAttribute("class")).toContain(
        displayedByTheApp.class,
      );
    });
  });

  describe("Tabs in the hydrated page", () => {
    let opened: OpenPage;

    beforeAll(async () => {
      opened = await openPage(browser(), url);
    });

    afterAll(async () => {
      await opened.close();
    });

    test("a click selects a tab, shows its panel alone and points the tab at it by the ids the root's id starts", async () => {
      const { page } = opened;
      const members = tabNamed(page, account, "Members");

      await members.click();

      expect(await stateOf(page, account)).toEqual({
        selected: "Members",
        focused: "Members",
        shown: ["Members panel"],
        tabStops: ["Members"],
      });
      expect(await members.getAttribute("id")).toBe("account-tab-members");
      expect(await members.getAttribute("aria-controls")).toBe("account-panel-members");
      expect(await page.getByText("Members panel").getAttribute("aria-labelledby")).toBe(
        "account-tab-members",
      );
      expect(await computed(page.getByText("Members panel"), "display")).toBe("flex");
      expect(await page.locator("#account").getAttribute("class")).toContain(
        stableClass("Tabs", rootPart),
      );
    });

    test("the colour of a tab runs its transition when the selection moves to it", async () => {
      const { page } = opened;
      const transitions = () =>
        page.evaluate(
          () => (window as Window & { transitionsRun?: string[] }).transitionsRun ?? [],
        );
      await tabList(page, account).evaluate((node) => {
        const ran: string[] = [];
        (window as Window & { transitionsRun?: string[] }).transitionsRun = ran;
        document.addEventListener("transitionrun", (event) => {
          if (event.target instanceof Node && node.contains(event.target)) {
            ran.push(event.propertyName);
          }
        });
      });

      await tabNamed(page, account, "Settings").click();

      await expect.poll(transitions).toContain("color");
    });

    test("a disabled tab is disabled, and a click on it selects nothing", async () => {
      const { page } = opened;
      const billing = tabNamed(page, account, "Billing");
      const { selected, shown } = await stateOf(page, account);

      await billing.click({ force: true });

      expect(await billing.isDisabled()).toBe(true);
      expect(await billing.getAttribute("data-disabled")).toBe("");
      expect(await billing.getAttribute("aria-selected")).toBe("false");
      expect(await stateOf(page, account)).toMatchObject({ selected, shown });
    });

    test("every tab with a panel names it, and a tab with none names no panel", async () => {
      const { page } = opened;
      const controls = (list: string) =>
        tabList(page, list).evaluate((node) =>
          [...node.querySelectorAll('[role="tab"]')].map((tab) => {
            const panel = tab.getAttribute("aria-controls");
            return panel === null ? null : (document.getElementById(panel)?.textContent ?? "");
          }),
        );
      await tabNamed(page, optional, "Files").click();

      for (const { list, tabs, keepsHiddenPanels } of tabsSetups) {
        expect(await controls(list), list).toEqual(
          tabs.map(({ name, panel }) => {
            if (panel === undefined) return null;
            return keepsHiddenPanels || panel.keepMounted ? panelOf(name) : "";
          }),
        );
      }
      expect(
        await tabList(page, account).evaluate((node) =>
          [...node.querySelectorAll('[role="tab"]')].map((tab) =>
            tab.getAttribute("aria-controls"),
          ),
        ),
      ).toEqual([
        "account-panel-overview",
        "account-panel-billing",
        "account-panel-members",
        "account-panel-settings",
      ]);
    });

    test("a list, its tabs and its panels carry the orientation, and only a vertical list says so to assistive technology", async () => {
      const { page } = opened;
      const orientations = (list: string) =>
        tabList(page, list).evaluate((node) => ({
          aria: node.getAttribute("aria-orientation"),
          data: [
            ...new Set(
              [
                node,
                ...node.querySelectorAll('[role="tab"]'),
                ...(node.parentElement?.querySelectorAll('[role="tabpanel"]') ?? []),
              ].map((element) => element.getAttribute("data-orientation")),
            ),
          ],
        }));

      expect(await orientations(account)).toEqual({ aria: null, data: ["horizontal"] });
      expect(await orientations(vertical)).toEqual({ aria: "vertical", data: ["vertical"] });
    });

    test("a horizontal list and its selected tab draw their edge under the tabs, and a vertical list and its selected tab draw it at their inline end", async () => {
      const { page } = opened;
      const edges = (element: Locator) =>
        element.evaluate((node) => {
          const style = getComputedStyle(node);
          const drawn = (lineStyle: string, width: string) =>
            lineStyle === "none" || lineStyle === "hidden" || width === "0px" ? "none" : width;
          return {
            under: drawn(style.borderBottomStyle, style.borderBottomWidth),
            inlineEnd: drawn(style.borderInlineEndStyle, style.borderInlineEndWidth),
          };
        });
      const selectedOf = (list: string) =>
        tabList(page, list).locator('[role="tab"][aria-selected="true"]');

      expect(await edges(tabList(page, account))).toEqual({ under: "1px", inlineEnd: "none" });
      expect(await edges(selectedOf(account))).toEqual({ under: "2px", inlineEnd: "none" });
      expect(await edges(tabList(page, vertical))).toEqual({ under: "none", inlineEnd: "1px" });
      expect(await edges(selectedOf(vertical))).toEqual({ under: "none", inlineEnd: "2px" });
    });

    test("a list wider than its container wraps, so every tab of every list lies inside a narrow container, in either direction", async () => {
      const narrow = await browser().newPage();
      await narrow.goto(url, { waitUntil: "networkidle" });
      const outside = await narrow.locator(tabsRegion).evaluate((region) => {
        if (!(region instanceof HTMLElement)) return ["the region is no HTML element"];
        region.style.width = "12rem";
        const { left: start, right: end } = region.getBoundingClientRect();
        return [...region.querySelectorAll('[role="tab"]')]
          .filter((tab) => {
            const { left, right } = tab.getBoundingClientRect();
            return left < start || right > end;
          })
          .map((tab) => tab.textContent);
      });

      await narrow.close();

      expect(outside).toEqual([]);
    });

    test("the Tab key enters a tab list at its selected tab and leaves it for the panel, which is focusable", async () => {
      const { page } = opened;
      await tabNamed(page, manual, "Two").click();
      await tabNamed(page, account, "Settings").click();
      await page.keyboard.press("Tab");

      expect(await page.evaluate(() => document.activeElement?.textContent)).toBe("Settings panel");

      await page.keyboard.press("Tab");

      expect(await stateOf(page, manual)).toMatchObject({ focused: "Two" });
    });

    test("with allowTabDeactivation a click on the selected tab selects none, and with keepMounted false a panel keeps its content only while it shows, unless the panel itself keeps it", async () => {
      const { page } = opened;
      const notes = tabNamed(page, optional, "Notes");
      const panels = () =>
        tabList(page, optional).evaluate((node) =>
          [...(node.parentElement?.querySelectorAll('[role="tabpanel"]') ?? [])].map(
            (panel) => panel.textContent,
          ),
        );
      if ((await stateOf(page, optional)).selected === "Notes") await notes.click();
      await tabNamed(page, optional, "Files").click();

      expect(await panels()).toEqual(["", "Files panel"]);

      await notes.click();

      expect(await stateOf(page, optional)).toMatchObject({
        selected: "Notes",
        shown: ["Notes panel"],
      });
      expect(await panels()).toEqual(["Notes panel", "Files panel"]);

      await notes.click();

      expect(await stateOf(page, optional)).toMatchObject({ selected: null, shown: [] });
      expect(await panels()).toEqual(["", "Files panel"]);
    });

    test("a controlled Tabs shows the value the app holds, tells the app each selection, and a tab whose own click handler prevents the default is never selected", async () => {
      const { page } = opened;
      const value = page.getByRole("status", { name: "Controlled value" });
      const refused = page.getByRole("status", { name: "Refused presses" });

      expect(await stateOf(page, controlled)).toMatchObject({ selected: "Drafts" });

      await tabNamed(page, controlled, "Inbox").click();

      expect(await value.textContent()).toBe("inbox");
      expect(await stateOf(page, controlled)).toMatchObject({ selected: "Inbox" });

      await tabNamed(page, controlled, "Locked").click();

      expect(await refused.textContent()).toBe("1");
      expect(await value.textContent()).toBe("inbox");
      expect(await stateOf(page, controlled)).toMatchObject({ selected: "Inbox" });

      await page.getByRole("button", { name: "Select none" }).click();

      expect(await value.textContent()).toBe("none");
      expect(await stateOf(page, controlled)).toMatchObject({ selected: null, shown: [] });
    });

    test("a controlled Tabs whose app changes nothing keeps showing the app's value, and tells the app each request", async () => {
      const { page } = opened;
      const requests = page.getByRole("status", { name: "Held requests" });

      await tabNamed(page, held, "Asked").click();

      await expect.poll(() => requests.textContent()).toBe("1");
      expect(await stateOf(page, held)).toMatchObject({
        selected: "Kept",
        shown: ["Kept panel"],
      });

      await tabNamed(page, held, "Kept").focus();
      await page.keyboard.press("ArrowRight");

      await expect.poll(() => requests.textContent()).toBe("2");
      expect(await stateOf(page, held)).toMatchObject({
        selected: "Kept",
        focused: "Asked",
        shown: ["Kept panel"],
      });
    });

    test("a tab names its panel only while the panel is in the page: with the panels unmounted no tab has aria-controls, and mounted again each tab names its own", async () => {
      const { page } = opened;
      const mounted = await elementsNamedBy(page, generated);

      expect(mounted).not.toEqual([]);
      expect(mounted).toEqual(mounted.map(() => ({ tab: [["its own"]], panel: [["its own"]] })));

      await page.getByRole("button", { name: "Unmount the panels" }).click();

      await expect
        .poll(() => elementsNamedBy(page, generated))
        .toEqual(mounted.map(() => ({ tab: [], panel: [] })));

      await page.getByRole("button", { name: "Mount the panels" }).click();

      await expect.poll(() => elementsNamedBy(page, generated)).toEqual(mounted);
    });

    test("axe-core finds no WCAG 2.2 A or AA violation in the Tabs region", async () => {
      const context = await browser().newContext();
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "networkidle" });
      await tabNamed(page, account, "Members").click();
      await tabNamed(page, optional, "Notes").click();
      await page.addScriptTag({ path: axeSource });
      const found = await page.evaluate(
        async ([region, tagPattern]) => {
          const { axe } = window as unknown as {
            axe: {
              getRules: () => { tags: string[] }[];
              run: (
                context: Element | null,
                options: object,
              ) => Promise<{
                violations: {
                  id: string;
                  help: string;
                  nodes: { target: string[]; failureSummary: string }[];
                }[];
              }>;
            };
          };
          const pattern = new RegExp(tagPattern);
          const tags = [...new Set(axe.getRules().flatMap(({ tags: found }) => found))].filter(
            (tag) => pattern.test(tag),
          );
          const results = await axe.run(document.querySelector(region), {
            runOnly: { type: "tag", values: tags },
          });
          return {
            tags,
            violations: results.violations.map(
              ({ id, help, nodes }) =>
                `${id}: ${help} (${nodes.map(({ target, failureSummary }) => `${target.join(" ")}: ${failureSummary}`).join(", ")})`,
            ),
          };
        },
        [tabsRegion, wcag22LevelAOrAA.source] as const,
      );

      await context.close();

      expect(found.tags).toEqual(expect.arrayContaining(["wcag2a", "wcag2aa", "wcag22aa"]));
      expect(found.violations).toEqual([]);
    });

    test.each(tabsSetups.flatMap(singleSteps))(
      "in $setup.list, with $from.selected selected and focus on $from.focused, after $key $to.selected is selected and focus is on $to.focused",
      async ({ setup, from, key, to }) => {
        const { list } = setup;
        const { selected, focused } = await stateOf(opened.page, list);
        for (const action of pathBetween(setup, { selected, focused }, from)) {
          if ("click" in action) await tabNamed(opened.page, list, action.click).click();
          else await opened.page.keyboard.press(action.key);
        }
        await expect.poll(() => stateOf(opened.page, list)).toMatchObject(from);

        await opened.page.keyboard.press(key);

        await expect
          .poll(() => stateOf(opened.page, list))
          .toMatchObject({ ...to, shown: to.selected === null ? [] : [panelOf(to.selected)] });
        const { tabStops } = await stateOf(opened.page, list);
        expect(tabStops, "the list has one tab stop").toHaveLength(1);
        if (to.selected !== null) {
          expect(tabStops, "the tab stop is the selected tab").toEqual([to.selected]);
        }
      },
    );
    test("hydration and every interaction above report no console error or warning", () => {
      expect(opened.consoleProblems).toEqual([]);
    });
  });

  describe("Tabs for a user who asks for less motion or forced colours", () => {
    test("a tab animates its colour, and does not where the user asks for reduced motion", async () => {
      const usual = await openPage(browser(), url);
      const reduced = await openPage(browser(), url, { reducedMotion: "reduce" });

      expect(await computed(tabNamed(usual.page, account, "Members"), "transition-property")).toBe(
        "color",
      );
      expect(
        await computed(tabNamed(reduced.page, account, "Members"), "transition-property"),
      ).toBe("none");

      await usual.close();
      await reduced.close();
    });

    test("with forced colours the selected tab still differs from the others by a border, which forced colours keep", async () => {
      const forced = await browser().newContext({ forcedColors: "active" });
      const page = await forced.newPage();
      await page.goto(url, { waitUntil: "networkidle" });

      expect(await computed(tabNamed(page, account, "Overview"), "border-bottom-style")).toBe(
        "solid",
      );
      expect(await computed(tabNamed(page, account, "Members"), "border-bottom-style")).toBe(
        "none",
      );
      expect(await computed(tabNamed(page, account, "Overview"), "border-bottom-width")).toBe(
        "2px",
      );

      await forced.close();
    });
  });
});
