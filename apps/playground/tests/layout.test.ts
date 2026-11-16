import type { Locator, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, test } from "vite-plus/test";
import { breakpointWidths } from "../../../packages/core/src/style-prop-table";
import {
  computed,
  type Expected,
  inEveryEngine,
  openPage,
  type OpenPage,
  scriptModes,
} from "./support/playground";

const url = inject("playgroundUrl");
const pixelsPerMediaQueryEm = 16;
const mdBreakpointInPixels = Number.parseFloat(breakpointWidths.md) * pixelsPerMediaQueryEm;
const viewportHeight = 800;
const viewports: [label: string, width: number, fromMd: boolean][] = [
  ["one pixel below the md breakpoint", mdBreakpointInPixels - 1, false],
  ["at the md breakpoint", mdBreakpointInPixels, true],
];

type Opened = { page: Page; expected: Expected; fromMd: boolean };

function after(page: Page, text: string): Locator {
  return page.getByText(text, { exact: true }).locator("xpath=following-sibling::*[1]");
}

async function centredIn(outer: Locator, inner: Locator): Promise<boolean> {
  return outer.evaluate(
    (parent, child) => {
      const around = parent.getBoundingClientRect();
      const within = child.getBoundingClientRect();
      const even = (before: number, after: number) => Math.abs(before - after) <= 1;
      return (
        even(within.left - around.left, around.right - within.right) &&
        even(within.top - around.top, around.bottom - within.bottom)
      );
    },
    await inner.elementHandle(),
  );
}

const checks: [behaviour: string, check: (opened: Opened) => Promise<void>][] = [
  [
    "a Space keeps the height and width it is given as its minimum, unless mih or miw replaces it",
    async ({ page, expected, fromMd }) => {
      expect(
        await computed(after(page, "Above the space"), "min-height"),
        "the minimum height follows h at each breakpoint",
      ).toBe(expected(fromMd ? "--solix-spacing-xl" : "--solix-spacing-md"));
      expect(
        await computed(after(page, "Before the space"), "min-width"),
        "the minimum width follows w, so a flex row cannot shrink it",
      ).toBe(expected("--solix-spacing-lg"));
      expect(
        await computed(after(page, "Above the pinned space"), "min-height"),
        "mih replaces h as the minimum height",
      ).toBe(expected("--solix-spacing-xs"));
    },
  ],
  [
    "a Center puts its content in its middle, and an inline Center is an inline flex container that component makes a link",
    async ({ page }) => {
      const content = page.getByText("Centered content", { exact: true });
      const center = content.locator("xpath=..");
      const link = page.getByRole("link", { name: "Inline centered link" });

      expect(await computed(center, "display")).toBe("flex");
      expect(await centredIn(center, content), "the content's margins to each edge are even").toBe(
        true,
      );
      expect(await computed(link, "display")).toBe("inline-flex");
      expect(await link.getAttribute("href")).toBe("#center");
    },
  ],
];

inEveryEngine((browser) => {
  describe.each(viewports)("%s", (_, width, fromMd) => {
    describe.each(scriptModes)("with scripts %s", (__, javaScriptEnabled) => {
      let opened: OpenPage;

      beforeAll(async () => {
        opened = await openPage(browser(), url, {
          javaScriptEnabled,
          viewport: { width, height: viewportHeight },
        });
      });

      afterAll(async () => {
        await opened.close();
      });

      test.each(checks)("%s", async (___, check) => {
        await check({ page: opened.page, expected: opened.expected, fromMd });
      });
    });
  });
});
