import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, inject, test } from "vite-plus/test";
import {
  BEHAVIOUR_SDK_LAYER,
  LIBRARY_CASCADE_LAYER,
} from "../../../packages/core/build-pipeline.mjs";
import { computed, inEveryEngine, openPage, type OpenPage } from "./support/playground";
import { sdkStyles, startAt, stateOf, tabList, tabNamed, tabsRegion } from "./support/tabs";

const url = inject("playgroundUrl");
const axeSource = join(import.meta.dirname, "../../../node_modules/axe-core/axe.min.js");
const wcag22LevelAOrAA = /^wcag2\d?a{1,2}$/;

type KeyboardCase = {
  list: string;
  direction?: "rtl";
  start: string;
  keys: string[];
  focused: string;
  selected: string;
};

const account = "Account";
const manual = "Manual vertical";
const vertical = "Vertical";
const optional = "Optional";
const keyboardTable: KeyboardCase[] = [
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

inEveryEngine((browser) => {
  describe("Tabs before any script runs", () => {
    let opened: OpenPage;

    beforeAll(async () => {
      opened = await openPage(browser(), url, { javaScriptEnabled: false });
    });

    afterAll(async () => {
      await opened.close();
    });

    test("arrive with the default tab selected, its panel shown and every other panel hidden, a panel that a style prop gives a display included, by the library's own stylesheet", async () => {
      const { page } = opened;

      expect(await stateOf(page, account)).toEqual({
        selected: "Overview",
        focused: null,
        shown: ["Overview panel"],
      });
      expect(await stateOf(page, optional)).toEqual({ selected: null, focused: null, shown: [] });
      expect(await page.getByText("Members panel").getAttribute("class")).toContain("sx-display");
      expect(await sdkStyles(page, BEHAVIOUR_SDK_LAYER)).toEqual([]);
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

    test("the SDK adds one style element for the behaviour this page uses, in its own layer, whose one declaration is important and hides a hidden slot, and the library's stylesheet has ordered that layer before its own", async () => {
      const layersOfLinkedSheets = await opened.page.evaluate(() =>
        [...document.styleSheets]
          .filter((sheet) => sheet.ownerNode instanceof HTMLLinkElement)
          .flatMap((sheet) =>
            [...sheet.cssRules].flatMap((rule) => {
              if (rule instanceof CSSLayerStatementRule) return [...rule.nameList];
              return rule instanceof CSSLayerBlockRule ? [rule.name] : [];
            }),
          ),
      );

      expect(await sdkStyles(opened.page, BEHAVIOUR_SDK_LAYER)).toEqual([
        `@layer ${BEHAVIOUR_SDK_LAYER} { :where([data-slot][hidden]:not([hidden="until-found"])) { display: none !important } }`,
      ]);
      expect([...new Set(layersOfLinkedSheets)]).toEqual([
        BEHAVIOUR_SDK_LAYER,
        LIBRARY_CASCADE_LAYER,
      ]);
    });

    test("a click selects a tab, shows its panel alone and points the tab at it by the ids the root's id starts", async () => {
      const { page } = opened;
      const members = tabNamed(page, account, "Members");

      await members.click();

      expect(await stateOf(page, account)).toEqual({
        selected: "Members",
        focused: "Members",
        shown: ["Members panel"],
      });
      expect(await members.getAttribute("id")).toBe("account-tab-members");
      expect(await members.getAttribute("aria-controls")).toBe("account-panel-members");
      expect(await page.getByText("Members panel").getAttribute("aria-labelledby")).toBe(
        "account-tab-members",
      );
      expect(await computed(page.getByText("Members panel"), "display")).toBe("flex");
      expect(await page.locator("#account").getAttribute("class")).toContain("solix-Tabs-root");
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
      expect(await controls(vertical)).toEqual(["Alpha panel", "Beta panel", "Gamma panel"]);
      expect(await controls(optional)).toEqual([null, "", "Files panel", null]);
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

    test.each(keyboardTable)(
      "in $list $direction, from $start the keys $keys focus $focused and select $selected",
      async ({ list, direction, start, keys, focused, selected }) => {
        const { page } = opened;
        await tabList(page, list).evaluate(
          (node, written) => node.setAttribute("dir", written),
          direction ?? "ltr",
        );
        await startAt(page, list, start);
        expect(await stateOf(page, list)).toMatchObject({ selected: start, focused: start });

        for (const key of keys) await page.keyboard.press(key);

        await expect.poll(() => stateOf(page, list)).toMatchObject({ focused, selected });
        expect((await stateOf(page, list)).shown).toEqual([`${selected} panel`]);
        await tabList(page, list).evaluate((node) => node.removeAttribute("dir"));
      },
    );

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

      expect(await stateOf(page, "Controlled")).toMatchObject({ selected: "Drafts" });

      await tabNamed(page, "Controlled", "Inbox").click();

      expect(await value.textContent()).toBe("inbox");
      expect(await stateOf(page, "Controlled")).toMatchObject({ selected: "Inbox" });

      await tabNamed(page, "Controlled", "Locked").click();

      expect(await refused.textContent()).toBe("1");
      expect(await value.textContent()).toBe("inbox");
      expect(await stateOf(page, "Controlled")).toMatchObject({ selected: "Inbox" });

      await page.getByRole("button", { name: "Select none" }).click();

      expect(await value.textContent()).toBe("none");
      expect(await stateOf(page, "Controlled")).toMatchObject({ selected: null, shown: [] });
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
