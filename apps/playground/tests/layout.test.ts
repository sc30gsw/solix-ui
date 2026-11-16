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

async function below(lower: Locator, upper: Locator): Promise<boolean> {
  const [top, bottom] = await Promise.all([
    lower.evaluate((node) => node.getBoundingClientRect().top),
    upper.evaluate((node) => node.getBoundingClientRect().bottom),
  ]);
  return top >= bottom;
}

function widthOf(element: Locator): Promise<number> {
  return element.evaluate((node) => node.getBoundingClientRect().width);
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
  [
    "a Stack lays its children out in a column with the md gap, or the gap and alignment it is given",
    async ({ page, expected }) => {
      const first = page.getByRole("button", { name: "First in the stack" });
      const stack = first.locator("xpath=..");
      const centred = page
        .getByText("Top of the centred stack", { exact: true })
        .locator("xpath=..");

      expect(await computed(stack, "flex-direction")).toBe("column");
      expect(await computed(stack, "row-gap")).toBe(expected("--solix-spacing-md"));
      expect(await computed(stack, "align-items")).toBe("stretch");
      expect(await below(page.getByRole("button", { name: "Second in the stack" }), first)).toBe(
        true,
      );
      expect(await computed(centred, "row-gap")).toBe(expected("--solix-spacing-xl"));
      expect(await computed(centred, "align-items")).toBe("center");
    },
  ],
  [
    "a Group lays its children out in a wrapping row with the md gap, and with grow gives each an equal share, or lets one take more when preventGrowOverflow is false",
    async ({ page, expected }) => {
      const first = page.getByRole("button", { name: "First in the group" });
      const group = first.locator("xpath=..");
      const growing = ["Grows", "Grows too", "Grows as well"].map((name) =>
        page.getByRole("button", { name, exact: true }),
      );
      const wide = page.getByRole("button", { name: /^A label wide enough/ });
      const short = page.getByRole("button", { name: "Short", exact: true });

      expect(await computed(group, "flex-direction")).toBe("row");
      expect(await computed(group, "flex-wrap")).toBe("wrap");
      expect(await computed(group, "column-gap")).toBe(expected("--solix-spacing-md"));
      expect(await computed(group, "align-items")).toBe("center");
      expect(await growing[0].locator("xpath=..").getAttribute("data-grow")).toBe("true");
      const widths = await Promise.all(growing.map(widthOf));
      expect(
        Math.max(...widths) - Math.min(...widths),
        "each growing child takes the same share of the row",
      ).toBeLessThanOrEqual(1);
      expect(await computed(growing[0], "flex-grow")).toBe("1");
      expect(await computed(wide, "max-width")).toBe("none");
      expect((await widthOf(wide)) > (await widthOf(short)) + 1).toBe(true);
    },
  ],
  [
    "a Flex sets each flexbox property it is given, switches the responsive ones at md, keeps rowGap over gap, and renders the element component names",
    async ({ page, expected, fromMd }) => {
      const flex = page.getByRole("button", { name: "First in the flex" }).locator("xpath=..");
      const list = page.getByRole("list", { name: "Flex list" });

      expect(await computed(flex, "display")).toBe("flex");
      expect(await computed(flex, "flex-direction")).toBe(fromMd ? "row" : "column");
      expect(await computed(flex, "column-gap")).toBe(
        expected(fromMd ? "--solix-spacing-xl" : "--solix-spacing-xs"),
      );
      expect(await computed(flex, "row-gap"), "rowGap, a longhand, beats gap at md").toBe(
        expected("--solix-spacing-sm"),
      );
      expect(await computed(flex, "align-items")).toBe("center");
      expect(await computed(flex, "justify-content")).toBe("space-between");
      expect(await computed(flex, "flex-wrap")).toBe("wrap");
      expect(await computed(list, "display")).toBe("flex");
      expect(await computed(list, "column-gap")).toBe(expected("--solix-spacing-lg"));
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
