import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, inject, test } from "vite-plus/test";
import {
  BEHAVIOUR_SDK_LAYER,
  LIBRARY_CASCADE_LAYER,
} from "../../../packages/core/build-pipeline.mjs";
import {
  computed,
  inEveryEngine,
  openPage,
  type OpenPage,
  scriptModes,
} from "./support/playground";
import { elementsNamedBy, sdkStyles, tabNamed } from "./support/tabs";

const url = inject("playgroundUrl");
const generatedRuns = 25;
const generated = "Generated";
const tabValues = fc.uniqueArray(
  fc.oneof(
    fc.string({ minLength: 1 }),
    fc.string({ unit: "grapheme", minLength: 1 }),
    fc.constantFrom(" ", "%", "\t", "\n", "a b", "100%", "%20", "a%20b"),
  ),
  { minLength: 1, maxLength: 5 },
);

inEveryEngine((browser) => {
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

    test("the SDK adds no style element before a script runs and one after, in its own layer, whose one declaration is important and hides a hidden slot, and the library's stylesheet has ordered that layer before its own", async () => {
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

      expect(await sdkStyles(opened.page, BEHAVIOUR_SDK_LAYER)).toEqual(
        javaScriptEnabled
          ? [
              `@layer ${BEHAVIOUR_SDK_LAYER} { :where([data-slot][hidden]:not([hidden="until-found"])) { display: none !important } }`,
            ]
          : [],
      );
      expect([...new Set(layersOfLinkedSheets)]).toEqual([
        BEHAVIOUR_SDK_LAYER,
        LIBRARY_CASCADE_LAYER,
      ]);
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
      const drafts = tabNamed(page, "Controlled", "Drafts");

      await drafts.hover();

      expect(await hovers.textContent()).toBe("0");

      await page.getByRole("button", { name: "Count hovers over Drafts" }).click();
      await drafts.hover();

      await expect.poll(() => hovers.textContent()).toBe("1");
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
