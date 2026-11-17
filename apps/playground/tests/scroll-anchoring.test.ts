import type { Page } from "playwright";
import { afterEach, beforeEach, describe, expect, inject, test } from "vite-plus/test";
import { inEveryEngine, openPage, type OpenPage } from "#/tests/support/playground.ts";
import { generated, tabList } from "#/tests/support/tabs.ts";

const url = inject("playgroundUrl");
const widerThanTheList = (letter: string) => letter.repeat(256);
const shorter = [widerThanTheList("a")];
const taller = [widerThanTheList("a"), widerThanTheList("b")];
const reRenders = 12;
const anchoringDisabledAtTheTenthAdjustment =
  "Scroll anchoring was disabled in a scroll container because of too many consecutive adjustments (10) with too little total distance (0 px average, 0 px total).";

type ReRendered = { listHeights: number[]; scrollOffsets: number[]; milliseconds: number };

async function reRenderTheGeneratedTabsAboveTheAnchor(
  page: Page,
  scrollBeforeEach: boolean,
): Promise<ReRendered> {
  const values = await page.getByRole("textbox", { name: "Tab values" }).elementHandle();
  return tabList(page, generated).evaluate(
    async (list, { input, baseline, sets, scrollsBeforeEach }) => {
      if (!(input instanceof HTMLInputElement)) throw new Error("The tab values are not an input.");
      const render = async (set: string[]) => {
        input.value = JSON.stringify(set);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        while (list.querySelectorAll('[role="tab"]').length !== set.length) {
          await new Promise((resolve) => setTimeout(resolve));
        }
        return list.getBoundingClientRect().height;
      };
      await render(baseline);
      window.scrollBy(0, input.getBoundingClientRect().top + input.offsetHeight / 2);
      const listHeights: number[] = [];
      const scrollOffsets: number[] = [];
      const start = performance.now();
      for (const set of sets) {
        if (scrollsBeforeEach) window.scrollBy(0, 1);
        listHeights.push(await render(set));
        scrollOffsets.push(window.scrollY);
      }
      return { listHeights, scrollOffsets, milliseconds: performance.now() - start };
    },
    {
      input: values,
      baseline: shorter,
      sets: Array.from({ length: reRenders }, (_, index) => (index % 2 === 0 ? taller : shorter)),
      scrollsBeforeEach: scrollBeforeEach,
    },
  );
}

function alternatesBetweenTwoHeights({ listHeights }: ReRendered): void {
  const [tallerHeight, shorterHeight] = listHeights;
  expect(tallerHeight).toBeGreaterThan(shorterHeight);
  expect(listHeights).toEqual(
    listHeights.map((_, index) => (index % 2 === 0 ? tallerHeight : shorterHeight)),
  );
}

inEveryEngine((browser) => {
  describe("the generated tabs re-rendered above the scroll anchor, between two heights that cancel", () => {
    let opened: OpenPage;

    beforeEach(async () => {
      opened = await openPage(browser(), url);
    });

    afterEach(async () => {
      await opened.close();
    });

    test("twelve times within half a second with no scroll between them, make Firefox disable scroll anchoring at the tenth consecutive adjustment, whose distances sum to zero, and report it as a warning, while Chromium and WebKit report no console error or warning", async () => {
      const reRendered = await reRenderTheGeneratedTabsAboveTheAnchor(opened.page, false);

      alternatesBetweenTwoHeights(reRendered);
      expect(opened.consoleProblems, JSON.stringify(reRendered)).toEqual(
        browser().browserType().name() === "firefox"
          ? [expect.stringContaining(anchoringDisabledAtTheTenthAdjustment)]
          : [],
      );
    });

    test("twelve times with a script scroll of one pixel before each, which resets Firefox's count of consecutive adjustments, report no console error or warning in any engine", async () => {
      const reRendered = await reRenderTheGeneratedTabsAboveTheAnchor(opened.page, true);

      alternatesBetweenTwoHeights(reRendered);
      expect(opened.consoleProblems, JSON.stringify(reRendered)).toEqual([]);
    });
  });
});
