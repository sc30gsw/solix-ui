import { join } from "node:path";
import { colorContrastRule } from "../../../tests/support/contrast-exceptions.ts";
import type { Locator } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, test } from "vite-plus/test";
import { paletteToken, primaryPalette } from "../../../packages/core/src/color-table";
import { baseKey, stylePropClass } from "../../../packages/core/src/style-prop-table";
import { rootPart, stableClass } from "../../../packages/core/tests/built-library";
import { wcag2AAndAATags } from "../../../tests/support/browser-gates.ts";
import { opened } from "#/tests/support/opening.ts";
import { computed, inEveryEngine, openPage, type OpenPage } from "#/tests/support/playground.ts";
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
  setupOf,
  stateOf,
  tabList,
  tabLists,
  tabNamed,
  tabNames,
  tabsRegion,
  type TabsSetup,
  tabsSetups,
  valueOf,
  vertical,
} from "#/tests/support/tabs.ts";
import { pathBetween, singleSteps } from "#/tests/support/roving-list-model.ts";

const url = inject("playgroundUrl");
const { overview, billing, members, security } = tabNames.account;
const { two } = tabNames.manual;
const { notes, files } = tabNames.optional;
const { inbox, drafts, locked } = tabNames.controlled;
const { kept, asked, styled, classed } = tabNames.held;
const axeSource = join(import.meta.dirname, "../../../node_modules/axe-core/axe.min.js");

inEveryEngine((browser) => {
  describe("Tabs before any script runs", () => {
    let onPage: OpenPage;

    beforeAll(async () => {
      onPage = await openPage(browser(), url, { javaScriptEnabled: false });
    });

    afterAll(async () => {
      await onPage.close();
    });

    test("arrive with the default tab selected, its panel shown and every other panel hidden, by the library's own stylesheet, a panel that a style prop, the consumer's style or the consumer's class gives a display included", async () => {
      const { page } = onPage;

      expect(await stateOf(page, account)).toEqual({
        selected: overview,
        focused: null,
        shown: [panelOf(overview)],
        tabStops: [overview],
      });
      expect(await stateOf(page, optional)).toMatchObject({
        selected: null,
        focused: null,
        shown: [],
      });
      expect(await page.getByText(panelOf(members)).getAttribute("class")).toContain(
        stylePropClass("display", baseKey),
      );
      expect(await stateOf(page, held)).toMatchObject({ shown: [panelOf(kept)] });
      expect(await page.getByText(panelOf(styled)).getAttribute("style")).toBe(
        displayedByTheApp.style,
      );
      expect(await page.getByText(panelOf(classed)).getAttribute("class")).toContain(
        displayedByTheApp.class,
      );
    });
  });

  describe("Tabs in the hydrated page", () => {
    let onPage: OpenPage;

    beforeAll(async () => {
      onPage = await openPage(browser(), url);
    });

    afterAll(async () => {
      await onPage.close();
    });

    test("a click selects a tab, shows its panel alone and points the tab at it by the ids the root's id starts", async () => {
      const { page } = onPage;
      const membersTab = tabNamed(page, account, members);

      await membersTab.click();

      expect(await stateOf(page, account)).toEqual({
        selected: members,
        focused: members,
        shown: [panelOf(members)],
        tabStops: [members],
      });
      expect(await membersTab.getAttribute("id")).toBe(`account-tab-${valueOf(members)}`);
      expect(await membersTab.getAttribute("aria-controls")).toBe(
        `account-panel-${valueOf(members)}`,
      );
      expect(await page.getByText(panelOf(members)).getAttribute("aria-labelledby")).toBe(
        `account-tab-${valueOf(members)}`,
      );
      expect(await computed(page.getByText(panelOf(members)), "display")).toBe("flex");
      expect(await page.locator("#account").getAttribute("class")).toContain(
        stableClass("Tabs", rootPart),
      );
    });

    test("the colour of a tab runs its transition when the selection moves to it", async () => {
      const { page } = onPage;
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

      await tabNamed(page, account, security).click();

      await expect.poll(transitions).toContain("color");
    });

    test("a disabled tab is disabled, and a click on it selects nothing", async () => {
      const { page } = onPage;
      const billingTab = tabNamed(page, account, billing);
      const { selected, shown } = await stateOf(page, account);

      await billingTab.click({ force: true });

      expect(await billingTab.isDisabled()).toBe(true);
      expect(await billingTab.getAttribute("data-disabled")).toBe("");
      expect(await billingTab.getAttribute("aria-selected")).toBe("false");
      expect(await stateOf(page, account)).toMatchObject({ selected, shown });
    });

    test("the selected tab takes the primary text colour, and every other enabled tab the text colour", async () => {
      const { page, expected } = onPage;
      const { selected } = await stateOf(page, account);
      const enabled = setupOf(account).tabs.filter(({ disabled }) => !disabled);

      expect(enabled).not.toEqual([]);
      for (const { name } of enabled) {
        await expect
          .poll(() => computed(tabNamed(page, account, name), "color"))
          .toBe(
            expected(name === selected ? paletteToken(primaryPalette, "9") : "--solix-color-text"),
          );
      }
    });

    test("every tab with a panel names it, and a tab with none names no panel", async () => {
      const { page } = onPage;
      const controls = (list: string) =>
        tabList(page, list).evaluate((node) =>
          [...node.querySelectorAll('[role="tab"]')].map((tab) => {
            const panel = tab.getAttribute("aria-controls");
            return panel === null ? null : (document.getElementById(panel)?.textContent ?? "");
          }),
        );
      await tabNamed(page, optional, files).click();

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
      ).toEqual(Object.values(tabNames.account).map((name) => `account-panel-${valueOf(name)}`));
    });

    test("a list, its tabs and its panels carry the orientation, and only a vertical list says so to assistive technology", async () => {
      const { page } = onPage;
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

    test("every horizontal list and its selected tab draw their edge under the tabs, and every vertical list and its selected tab draw it at their inline end", async () => {
      const { page } = onPage;
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

      const edgeOf = ({ orientation }: TabsSetup, width: string) =>
        orientation === "vertical"
          ? { under: "none", inlineEnd: width }
          : { under: width, inlineEnd: "none" };

      expect(tabsSetups.map(({ orientation }) => orientation)).toContain("vertical");
      for (const setup of tabsSetups) {
        expect(await edges(tabList(page, setup.list)), setup.list).toEqual(edgeOf(setup, "1px"));
      }
      for (const setup of tabsSetups.filter(({ deselects }) => !deselects)) {
        expect(await edges(selectedOf(setup.list)), `the selected tab of ${setup.list}`).toEqual(
          edgeOf(setup, "2px"),
        );
      }
    });

    test("a list wider than its container wraps, so every tab of every list outside a shadow root lies inside a narrow container, in either direction", async () => {
      const narrow = await browser().newPage();
      await opened(narrow, url, "hydrated");
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
      const { page } = onPage;
      await tabNamed(page, manual, two).click();
      await tabNamed(page, account, security).click();
      await page.keyboard.press("Tab");

      expect(await page.evaluate(() => document.activeElement?.textContent)).toBe(
        panelOf(security),
      );

      await page.keyboard.press("Tab");

      expect(await stateOf(page, manual)).toMatchObject({ focused: two });
    });

    test("Shift+Tab leaves a tab list from the selected tab that a click focused, whether or not it had focus before the click, Tab comes back to that tab and shows the focus ring in the primary colour, and the click shows no focus ring", async () => {
      const { page, expected } = onPage;
      const securityTab = tabNamed(page, account, security);
      const pressAndFind = async (key: string) => {
        await page.keyboard.press(key);
        return page.evaluate((list) => {
          const active = document.activeElement;
          const described =
            active === null
              ? "nothing"
              : `<${active.tagName.toLowerCase()} role="${active.getAttribute("role") ?? ""}"> "${active.textContent ?? ""}"`;
          return {
            described,
            inTheList: active?.closest('[role="tablist"]')?.getAttribute("aria-label") === list,
          };
        }, account);
      };
      const clicks = [
        { name: "a click that moves focus to the tab", times: 1 },
        { name: "a click on the tab that has focus", times: 2 },
      ];
      for (const click of clicks) {
        await tabNamed(page, account, overview).click();
        for (let pressed = 0; pressed < click.times; pressed += 1) await securityTab.click();

        expect(await computed(securityTab, "outline-style"), `${click.name}: focus ring`).toBe(
          "none",
        );

        const left = await pressAndFind("Shift+Tab");

        expect(
          left.inTheList,
          `${click.name}, then Shift+Tab: document.activeElement is ${left.described}`,
        ).toBe(false);

        const back = await pressAndFind("Tab");

        expect(
          (await stateOf(page, account)).focused,
          `${click.name}, then Shift+Tab and Tab: document.activeElement is ${back.described}`,
        ).toBe(security);
        expect(
          await computed(securityTab, "outline-style"),
          `${click.name}, then Shift+Tab and Tab: focus ring`,
        ).toBe("solid");
        expect(await computed(securityTab, "outline-color")).toBe(
          expected(paletteToken(primaryPalette, "6")),
        );
      }
    });

    test("a click on the tab that has focus fires no blur, focusout, focus or focusin", async () => {
      const { page } = onPage;
      const securityTab = tabNamed(page, account, security);
      await securityTab.click();
      await tabList(page, account).evaluate((node) => {
        const fired: string[] = [];
        (window as Window & { focusEventsFired?: string[] }).focusEventsFired = fired;
        for (const type of ["blur", "focusout", "focus", "focusin"]) {
          node.addEventListener(type, (event) => fired.push(event.type), { capture: true });
        }
      });

      await securityTab.click();

      expect(await stateOf(page, account)).toMatchObject({ focused: security });
      expect(
        await page.evaluate(
          () => (window as Window & { focusEventsFired?: string[] }).focusEventsFired,
        ),
      ).toEqual([]);
    });

    test("with allowTabDeactivation a click on the selected tab selects none, and with keepMounted false a panel keeps its content only while it shows, unless the panel itself keeps it", async () => {
      const { page } = onPage;
      const notesTab = tabNamed(page, optional, notes);
      const panels = () =>
        tabList(page, optional).evaluate((node) =>
          [...(node.parentElement?.querySelectorAll('[role="tabpanel"]') ?? [])].map(
            (panel) => panel.textContent,
          ),
        );
      if ((await stateOf(page, optional)).selected === notes) await notesTab.click();
      await tabNamed(page, optional, files).click();

      expect(await panels()).toEqual(["", panelOf(files)]);

      await notesTab.click();

      expect(await stateOf(page, optional)).toMatchObject({
        selected: notes,
        shown: [panelOf(notes)],
      });
      expect(await panels()).toEqual([panelOf(notes), panelOf(files)]);

      await notesTab.click();

      expect(await stateOf(page, optional)).toMatchObject({ selected: null, shown: [] });
      expect(await panels()).toEqual(["", panelOf(files)]);
    });

    test("a controlled Tabs shows the value the app holds, tells the app each selection, and a tab whose own click handler prevents the default is never selected", async () => {
      const { page } = onPage;
      const value = page.getByRole("status", { name: "Controlled value" });
      const refused = page.getByRole("status", { name: "Refused presses" });

      expect(await stateOf(page, controlled)).toMatchObject({ selected: drafts });

      await tabNamed(page, controlled, inbox).click();

      expect(await value.textContent()).toBe(valueOf(inbox));
      expect(await stateOf(page, controlled)).toMatchObject({ selected: inbox });

      await tabNamed(page, controlled, locked).click();

      expect(await refused.textContent()).toBe("1");
      expect(await value.textContent()).toBe(valueOf(inbox));
      expect(await stateOf(page, controlled)).toMatchObject({ selected: inbox });

      await page.getByRole("button", { name: "Select none" }).click();

      expect(await value.textContent()).toBe("none");
      expect(await stateOf(page, controlled)).toMatchObject({ selected: null, shown: [] });
    });

    test("a controlled Tabs whose app changes nothing keeps showing the app's value, and tells the app each request", async () => {
      const { page } = onPage;
      const requests = page.getByRole("status", { name: "Held requests" });

      await tabNamed(page, held, asked).click();

      await expect.poll(() => requests.textContent()).toBe("1");
      expect(await stateOf(page, held)).toMatchObject({
        selected: kept,
        shown: [panelOf(kept)],
      });

      await tabNamed(page, held, kept).focus();
      await page.keyboard.press("ArrowRight");

      await expect.poll(() => requests.textContent()).toBe("2");
      expect(await stateOf(page, held)).toMatchObject({
        selected: kept,
        focused: asked,
        shown: [panelOf(kept)],
      });
    });

    test("a tab names its panel only while the panel is in the page: with the panels unmounted no tab has aria-controls, and mounted again each tab names its own", async () => {
      const { page } = onPage;
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

    test("axe-core finds no WCAG 2.2 A or AA violation in the Tabs region, but the colour contrast of a pair contrastExceptions lists", async () => {
      const context = await browser().newContext();
      const page = await context.newPage();
      await opened(page, url, "hydrated");
      await tabNamed(page, account, members).click();
      await tabNamed(page, optional, notes).click();
      await page.addScriptTag({ path: axeSource });
      const found = await page.evaluate(
        async ([region, tags, colorContrast]) => {
          const { axe } = window as unknown as {
            axe: {
              configure: (spec: { rules: object[] }) => void;
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
          axe.configure({ rules: [colorContrast] });
          const results = await axe.run(document.querySelector(region), {
            runOnly: { type: "tag", values: tags },
          });
          return results.violations.map(
            ({ id, help, nodes }) =>
              `${id}: ${help} (${nodes.map(({ target, failureSummary }) => `${target.join(" ")}: ${failureSummary}`).join(", ")})`,
          );
        },
        [tabsRegion, wcag2AAndAATags, colorContrastRule] as const,
      );

      await context.close();

      expect(found).toEqual([]);
    });

    test.each(tabLists.flatMap(singleSteps))(
      "in $list.name, with $from.selected selected and focus on $from.focused, after $key $to.selected is selected and focus is on $to.focused",
      async ({ list: rovingList, from, key, to }) => {
        const list = rovingList.name;
        const { selected, focused } = await stateOf(onPage.page, list);
        for (const action of pathBetween(rovingList, { selected, focused }, from)) {
          if ("click" in action) await tabNamed(onPage.page, list, action.click).click();
          else await onPage.page.keyboard.press(action.key);
        }
        await expect.poll(() => stateOf(onPage.page, list)).toMatchObject(from);

        await onPage.page.keyboard.press(key);

        await expect
          .poll(() => stateOf(onPage.page, list))
          .toMatchObject({ ...to, shown: to.selected === null ? [] : [panelOf(to.selected)] });
        const { tabStops } = await stateOf(onPage.page, list);
        expect(tabStops, "the list has one tab stop").toHaveLength(1);
        if (to.selected !== null) {
          expect(tabStops, "the tab stop is the selected tab").toEqual([to.selected]);
        }
      },
    );
  });

  describe("Tabs for a user who asks for less motion or forced colours", () => {
    test("a tab animates its colour, and does not where the user asks for reduced motion", async () => {
      const usual = await openPage(browser(), url);
      const reduced = await openPage(browser(), url, { reducedMotion: "reduce" });

      expect(await computed(tabNamed(usual.page, account, members), "transition-property")).toBe(
        "color",
      );
      expect(await computed(tabNamed(reduced.page, account, members), "transition-property")).toBe(
        "none",
      );

      await usual.close();
      await reduced.close();
    });

    test("with forced colours the selected tab still differs from the others by a border, which forced colours keep", async () => {
      const forced = await browser().newContext({ forcedColors: "active" });
      const page = await forced.newPage();
      await opened(page, url, "hydrated");

      expect(await computed(tabNamed(page, account, overview), "border-bottom-style")).toBe(
        "solid",
      );
      expect(await computed(tabNamed(page, account, members), "border-bottom-style")).toBe("none");
      expect(await computed(tabNamed(page, account, overview), "border-bottom-width")).toBe("2px");

      await forced.close();
    });
  });
});
