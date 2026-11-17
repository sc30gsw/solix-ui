import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, inject, test } from "vite-plus/test";
import { join } from "node:path";
import {
  BEHAVIOUR_SDK_LAYER,
  behaviourSdkHiddenRule,
  LIBRARY_CASCADE_LAYER,
} from "../../../packages/core/build-pipeline.mjs";
import { cascadeLayerOrder } from "../../../packages/core/src/cascade-layers";
import { rootPart, stableClass, stylesheet } from "../../../packages/core/tests/built-library";
import {
  computed,
  inEveryEngine,
  openPage,
  type OpenPage,
  scriptModes,
} from "./support/playground";
import { pageStyleRules, type PageStyleRule, stylesAddedToThePage } from "./support/page-styles";
import {
  controlled,
  elementsNamedBy,
  generated,
  inAShadowRoot,
  panelOf,
  stateOf,
  tabList,
  tabNamed,
  tabNames,
} from "./support/tabs";

const url = inject("playgroundUrl");
const { inbox, drafts, locked } = tabNames.controlled;
const { near, far } = tabNames.inAShadowRoot;
const generatedRuns = 25;
const sdkHiddenRule = behaviourSdkHiddenRule(join(import.meta.dirname, "../../../packages/core"));
const tabValues = fc.uniqueArray(
  fc.oneof(
    fc.string({ minLength: 1 }),
    fc.string({ unit: "grapheme", minLength: 1 }),
    fc.constantFrom(" ", "%", "\t", "\n", "a b", "100%", "%20", "a%20b"),
  ),
  { minLength: 1, maxLength: 5 },
);

inEveryEngine((browser) => {
  test("the library's stylesheet alone, with no behaviour component mounted, leaves a hidden element of another library, whose class holds the stable class prefix only inside a word, to the display its style gives, and keeps hidden a part with a class that starts with the stable class prefix, first or after another class, when its style gives it a display", async () => {
    const page = await browser().newPage();
    await page.setContent(
      [
        `<style>${stylesheet}</style>`,
        '<div data-slot="x" hidden class="notsolix-thing tp-flex" style="display:block">Another library</div>',
        `<div data-slot="tabs-panel" hidden class="${stableClass("TabsPanel", rootPart)}" style="display:grid">A part</div>`,
        `<div data-slot="tabs-panel" hidden class="app-grid ${stableClass("TabsPanel", rootPart)}" style="display:grid">A part after a class of the app's</div>`,
      ].join(""),
    );

    expect(await computed(page.getByText("Another library"), "display")).toBe("block");
    expect(await computed(page.getByText("A part", { exact: true }), "display")).toBe("none");
    expect(await computed(page.getByText("A part after a class of the app's"), "display")).toBe(
      "none",
    );

    await page.close();
  });

  describe.each(scriptModes)("with scripts %s", (_, javaScriptEnabled) => {
    let opened: OpenPage;

    beforeAll(async () => {
      opened = await openPage(browser(), url, { javaScriptEnabled });
    });

    afterAll(async () => {
      await opened.close();
    });

    test("a hidden element that a style prop gives a display stays hidden, and one hidden until found is left to the browser", async () => {
      const { page } = opened;

      expect(await computed(page.getByText("Hidden with a display"), "display")).toBe("none");
      expect(await computed(page.getByText("Hidden until found with a display"), "display")).toBe(
        "flex",
      );
    });

    test("before a script runs the page holds no style but the library's own, and after it every rule the SDK adds sits in the layer the library's stylesheet orders before its own, among them the hidden rule as the build reads it from the SDK, every rule of the library's own styles sits in the library's layer, and every important declaration on the page sits in the SDK's layer", async () => {
      const plain = await browser().newContext({ javaScriptEnabled });
      const page = await plain.newPage();
      await page.goto(url, { waitUntil: javaScriptEnabled ? "networkidle" : "load" });
      const rules = await pageStyleRules(page);
      const added = await stylesAddedToThePage(page);
      await plain.close();
      const linkedLayerOrder = rules
        .filter(
          ({ addedAtRunTime, addedByTheLibrary, layers }) =>
            !addedAtRunTime && !addedByTheLibrary && layers.length > 0,
        )
        .map(({ layers: [outermost] }) => outermost);
      const outsideTheSdkLayer = (rule: PageStyleRule) => rule.layers[0] !== BEHAVIOUR_SDK_LAYER;

      expect(
        rules
          .filter((rule) => rule.addedAtRunTime && outsideTheSdkLayer(rule))
          .map(({ text }) => text),
      ).toEqual([]);
      expect(
        rules
          .filter(
            ({ addedByTheLibrary, layers, text }) =>
              addedByTheLibrary &&
              text !== cascadeLayerOrder &&
              layers[0] !== LIBRARY_CASCADE_LAYER,
          )
          .map(({ text }) => text),
      ).toEqual([]);
      expect(rules.some(({ addedByTheLibrary }) => addedByTheLibrary)).toBe(true);
      expect(
        rules
          .filter((rule) => rule.important.length > 0 && outsideTheSdkLayer(rule))
          .map(({ text }) => text),
      ).toEqual([]);
      expect(added.includes(sdkHiddenRule)).toBe(javaScriptEnabled);
      expect(javaScriptEnabled ? [] : added).toEqual([]);
      expect([...new Set(linkedLayerOrder)]).toEqual([BEHAVIOUR_SDK_LAYER, LIBRARY_CASCADE_LAYER]);
    });
  });

  describe("a behaviour component in the hydrated page", () => {
    let opened: OpenPage;

    beforeAll(async () => {
      opened = await openPage(browser(), url);
    });

    afterAll(async () => {
      await opened.close();
    });

    test("a handler the app gives a tab after the first render, of an event neither the component nor the SDK handles, reaches the tab", async () => {
      const { page } = opened;
      const hovers = page.getByRole("status", { name: "Drafts hovers" });
      const draftsTab = tabNamed(page, controlled, drafts);

      await draftsTab.hover();

      expect(await hovers.textContent()).toBe("0");

      await page.getByRole("button", { name: "Count hovers over Drafts" }).click();
      await draftsTab.hover();

      await expect.poll(() => hovers.textContent()).toBe("1");
    });

    test("every tab stays the element it was, and an element passed as a section is created once, across a click on another tab, an arrow key, and a handler given to the list after the first render", async () => {
      const { page } = opened;
      const list = tabList(page, controlled);
      const created = page.getByRole("status", { name: "Section elements created" });
      const hovers = page.getByRole("status", { name: "List hovers" });
      const kept = () =>
        list.evaluate((node) =>
          [...node.querySelectorAll('[role="tab"]')].map(
            (tab) => (tab as Element & { keptSince?: string }).keptSince ?? "a new element",
          ),
        );
      const sinceTheStart = ["the start", "the start", "the start"];
      await list.evaluate((node) => {
        for (const tab of node.querySelectorAll('[role="tab"]')) {
          (tab as Element & { keptSince?: string }).keptSince = "the start";
        }
      });

      await tabNamed(page, controlled, inbox).click();

      await expect.poll(() => stateOf(page, controlled)).toMatchObject({ selected: inbox });
      expect(await kept(), "after a click on another tab").toEqual(sinceTheStart);

      await page.keyboard.press("ArrowRight");

      await expect.poll(() => stateOf(page, controlled)).toMatchObject({ selected: drafts });
      expect(await kept(), "after an arrow key").toEqual(sinceTheStart);

      await page.getByRole("button", { name: "Count hovers over the list" }).click();
      await page.mouse.move(0, 0);
      await tabNamed(page, controlled, locked).hover();

      await expect.poll(() => hovers.textContent()).toBe("1");
      expect(await kept(), "after the list is given a handler").toEqual(sinceTheStart);
      expect(await created.textContent()).toBe("1");
    });

    test("tabs rendered in a shadow root keep focus and their arrow keys across a selection that steps over a disabled tab", async () => {
      const { page } = opened;
      await page.getByRole("button", { name: "Render tabs in a shadow root" }).click();
      await tabNamed(page, inAShadowRoot, near).click();

      await page.keyboard.press("ArrowRight");

      await expect
        .poll(() => stateOf(page, inAShadowRoot))
        .toMatchObject({ selected: far, focused: far, shown: [panelOf(far)] });

      await page.keyboard.press("ArrowLeft");

      await expect
        .poll(() => stateOf(page, inAShadowRoot))
        .toMatchObject({ selected: near, focused: near, shown: [panelOf(near)] });
    });

    test("for generated tab values under a root id, every tab's aria-controls names exactly one element, its panel, and every panel's aria-labelledby names exactly one element, its tab", async () => {
      const { page } = opened;
      const values = page.getByRole("textbox", { name: "Tab values" });

      await fc.assert(
        fc.asyncProperty(tabValues, async (drawn) => {
          await values.fill(JSON.stringify(drawn));

          await expect
            .poll(() => elementsNamedBy(page, generated))
            .toEqual(drawn.map(() => ({ tab: [["its own"]], panel: [["its own"]] })));
        }),
        { numRuns: generatedRuns, examples: [[["my tab"]]] },
      );
    });

    test("hydration and every interaction above report no console error or warning", () => {
      expect(opened.consoleProblems).toEqual([]);
    });
  });
});
