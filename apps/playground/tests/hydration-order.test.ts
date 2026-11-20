import type { Browser, Page } from "playwright";
import { expect, inject, test } from "vite-plus/test";
import { hydratedMark } from "#/src/hydrated-mark.ts";
import { withItsStylesheetsLate } from "#/tests/support/late-stylesheets.ts";
import { opened } from "#/tests/support/opening.ts";
import { inEveryEngine } from "#/tests/support/playground.ts";

const url = inject("playgroundUrl");

type Styled = { bodyBackground: string; panelsShown: number };

type StyledWindow = Window & { styledAtHydration?: Styled; styledNow?: () => Styled };

async function recordTheStylesAtHydration(page: Page): Promise<void> {
  await page.addInitScript((mark) => {
    const styledWindow = window as StyledWindow;
    const styledNow = (): Styled => ({
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      panelsShown: [...document.querySelectorAll('[role="tabpanel"]')].filter(
        (panel) => getComputedStyle(panel).display !== "none",
      ).length,
    });
    styledWindow.styledNow = styledNow;
    new MutationObserver((_, observer) => {
      if (!document.documentElement.hasAttribute(mark)) return;
      observer.disconnect();
      styledWindow.styledAtHydration = styledNow();
    }).observe(document, { attributes: true, subtree: true, attributeFilter: [mark] });
  }, hydratedMark);
}

async function stylesAtHydrationAndOnceLoaded(
  browser: Browser,
  { stylesheetsLate }: { stylesheetsLate: boolean },
): Promise<{ atHydration?: Styled; loaded?: Styled }> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await recordTheStylesAtHydration(page);
    if (stylesheetsLate) await withItsStylesheetsLate(page, url);
    await opened(page, url, "hydrated");
    await page.waitForLoadState("load");
    return await page.evaluate(() => {
      const styledWindow = window as StyledWindow;
      return { atHydration: styledWindow.styledAtHydration, loaded: styledWindow.styledNow?.() };
    });
  } finally {
    await context.close();
  }
}

inEveryEngine((browser) => {
  for (const [how, stylesheetsLate] of [
    ["as served", false],
    ["whose stylesheet arrives after its client script", true],
  ] as const) {
    test(`on a page ${how}, the playground hydrates only once its stylesheets apply: at the moment it marks itself hydrated, its body and its tab panels are styled as they are once the page has loaded`, async () => {
      const { atHydration, loaded } = await stylesAtHydrationAndOnceLoaded(browser(), {
        stylesheetsLate,
      });

      expect(loaded?.panelsShown).toBeGreaterThan(0);
      expect(atHydration).toEqual(loaded);
    });
  }
});
