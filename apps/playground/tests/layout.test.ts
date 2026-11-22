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
} from "#/tests/support/playground.ts";
import {
  expectTheBoxCascade,
  lgBreakpointInPixels,
  mdBreakpointInPixels,
  viewportHeight,
  viewports,
} from "#/tests/support/box-cascade.ts";

const url = inject("playgroundUrl");

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

function columnsOf(grid: Locator): Promise<number> {
  return grid.evaluate(
    (node) => getComputedStyle(node).gridTemplateColumns.split(" ").filter(Boolean).length,
  );
}

function gridAround(page: Page, text: string): Locator {
  return page.getByText(text, { exact: true }).locator("xpath=..");
}

type Box = { left: number; top: number; bottom: number; width: number };

function boxOf(element: Locator): Promise<Box> {
  return element.evaluate((node) => {
    const { left, top, bottom, width } = node.getBoundingClientRect();
    return { left, top, bottom, width };
  });
}

async function spanWidth(column: Locator, span: number, columns: number): Promise<number> {
  const inner = column.locator("xpath=..");
  const [{ width }, gap] = await Promise.all([
    boxOf(inner),
    inner.evaluate((node) => Number.parseFloat(getComputedStyle(node).columnGap)),
  ]);
  return ((width + gap) * span) / columns - gap;
}

function near(actual: number, wanted: number): boolean {
  return Math.abs(actual - wanted) <= 1;
}

function widthOf(element: Locator): Promise<number> {
  return element.evaluate((node) => node.getBoundingClientRect().width);
}

async function horizontallyCentredIn(outer: Locator, inner: Locator): Promise<boolean> {
  return outer.evaluate(
    (parent, child) => {
      const around = parent.getBoundingClientRect();
      const within = child.getBoundingClientRect();
      return Math.abs(within.left - around.left - (around.right - within.right)) <= 1;
    },
    await inner.elementHandle(),
  );
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

async function expectTheKeyedSpaces(
  page: Page,
  expected: Expected,
  width: "base" | "md" | "lg",
): Promise<void> {
  expect(
    await computed(after(page, "Above the space with a blank mih"), "min-height"),
    "a blank mih leaves h as the minimum height",
  ).toBe(expected("--solix-spacing-xl"));
  expect(
    await computed(after(page, "Above the space with mih from md"), "min-height"),
    "h is the minimum height below the breakpoint mih names, and mih from it up",
  ).toBe(expected(width === "base" ? "--solix-spacing-xl" : "--solix-spacing-xs"));
  expect(
    await computed(after(page, "Above the space with mih from md over h from lg"), "min-height"),
    "mih from md holds over an h that changes at lg",
  ).toBe(expected(width === "base" ? "--solix-spacing-md" : "--solix-spacing-xs"));
  expect(
    await computed(after(page, "Before the space with miw from md"), "min-width"),
    "w is the minimum width below the breakpoint miw names, and miw from it up",
  ).toBe(expected(width === "base" ? "--solix-spacing-lg" : "--solix-spacing-xs"));
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
      await expectTheKeyedSpaces(page, expected, fromMd ? "md" : "base");
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
  [
    "a Container centres its content up to its size, takes the whole width when fluid, and with the grid strategy puts its children in a middle column that a breakout child leaves",
    async ({ page, expected }) => {
      const container = (text: string) => page.getByText(text, { exact: true }).locator("xpath=..");
      const plain = container("Inside the default container");
      const grid = container("In the middle column of the grid container");
      const breakout = container("Breaks out of the grid container");
      const back = container("Back to the width of the grid container");

      expect(await computed(plain, "max-width")).toBe(expected("--solix-container-size-md"));
      expect(await computed(plain, "padding-left")).toBe(expected("--solix-spacing-md"));
      expect(await horizontallyCentredIn(plain.locator("xpath=.."), plain)).toBe(true);
      expect(await plain.getAttribute("data-strategy")).toBe("block");
      expect(await computed(container("Inside the extra small container"), "max-width")).toBe(
        expected("--solix-container-size-xs"),
      );
      expect(await computed(container("Inside the fluid container"), "max-width")).toBe("100%");
      expect(await container("Inside the fluid container").getAttribute("data-fluid")).toBe("true");
      expect(await computed(grid, "display")).toBe("grid");
      expect(await computed(grid, "max-width")).toBe("none");
      expect(
        Math.abs(
          (await widthOf(page.getByText("In the middle column of the grid container"))) -
            (await widthOf(back)),
        ),
        "a child of the grid takes the middle column, as wide as the size",
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs((await widthOf(breakout)) - (await widthOf(grid))),
        "a breakout child spans the whole grid",
      ).toBeLessThanOrEqual(1);
      expect(await computed(back, "max-width")).toBe(expected("--solix-container-size-xs"));
      expect(await horizontallyCentredIn(grid, back)).toBe(true);
    },
  ],
  [
    "a SimpleGrid takes the columns and spacing its breakpoints name, or with container queries the columns its container's width names, and fills a row with columns at least minColWidth wide",
    async ({ page, expected, fromMd }) => {
      const media = page.getByText("First cell", { exact: true }).locator("xpath=..");
      const narrow = gridAround(page, "Cell of the narrow container");
      const wide = gridAround(page, "Cell of the wide container");
      const nested = gridAround(page, "Cell of the nested container");
      const filled = gridAround(page, "Auto-filled cell");

      expect(await computed(media, "display")).toBe("grid");
      expect(await columnsOf(media)).toBe(fromMd ? 3 : 2);
      expect(await computed(media, "column-gap")).toBe(
        expected(fromMd ? "--solix-spacing-lg" : "--solix-spacing-xs"),
      );
      expect(await computed(media, "row-gap")).toBe(expected("--solix-spacing-xl"));
      expect(await columnsOf(narrow), "a 320 pixel container is past 18em").toBe(2);
      expect(await columnsOf(wide), "a 560 pixel container is past 30em").toBe(4);
      expect(await columnsOf(nested), "a grid in one cell queries its own container").toBe(1);
      expect(
        await columnsOf(gridAround(page, "Cell of a container past md")),
        `a 1024 pixel container is past the library's md, ${breakpointWidths.md}, whatever the viewport`,
      ).toBe(2);
      expect(
        await columnsOf(gridAround(page, "Cell of a container past md in larger type")),
        "a 1100 pixel container whose type is 20 pixels is past md, as a media query measures it",
      ).toBe(2);
      expect(
        await columnsOf(gridAround(page, "Cell of a container short of md")),
        `a 960 pixel container is short of the library's md, ${breakpointWidths.md}, whatever the viewport`,
      ).toBe(1);
      expect(await computed(narrow, "row-gap"), "verticalSpacing follows spacing").toBe(
        expected("--solix-spacing-md"),
      );
      expect(
        (await widthOf(page.getByText("Auto-filled cell", { exact: true }))) >= 160 &&
          (await columnsOf(filled)) > 2,
        "auto-fill makes as many columns of at least 160 pixels as fit",
      ).toBe(true);
    },
  ],
  [
    "a Grid gives each column the share of its row that span names, at each breakpoint or container width, after an offset and in the order given, with auto and content spans, columns and grow",
    async ({ page, expected, fromMd }) => {
      const column = (text: string) => page.getByText(text, { exact: true });
      const half = column("Half from md");

      expect(await computed(half.locator("xpath=.."), "column-gap")).toBe(
        expected(fromMd ? "--solix-spacing-lg" : "--solix-spacing-xs"),
      );
      expect(
        near((await boxOf(half)).width, await spanWidth(half, fromMd ? 6 : 12, 12)),
        "span 12 below md and 6 from md",
      ).toBe(true);
      const third = await boxOf(column("A third"));
      const offset = await boxOf(column("A third after an offset"));
      expect(near(third.width, await spanWidth(column("A third"), 4, 12))).toBe(true);
      expect(
        near(
          offset.left - (third.left + third.width),
          (await spanWidth(column("A third"), 4, 12)) +
            2 *
              Number.parseFloat(
                await computed(column("A third").locator("xpath=.."), "column-gap"),
              ),
        ),
        "an offset of 4 leaves four columns and their gaps empty",
      ).toBe(true);
      const [one, two] = await Promise.all([
        boxOf(column("Ordered one")),
        boxOf(column("Ordered two")),
      ]);
      expect(
        one.top === two.top && (fromMd ? one.left < two.left : two.left < one.left),
        "order puts two first below md and one first from md, in one row",
      ).toBe(true);
      const content = column("Content column");
      expect(await computed(content, "width")).not.toBe(
        await computed(content.locator("xpath=.."), "width"),
      );
      expect(await computed(content, "flex-basis")).toBe("auto");
      expect(await computed(column("Auto column"), "flex-grow")).toBe("1");
      const [tall, short] = await Promise.all([
        boxOf(column("Grows to half")),
        boxOf(column("Grows to the other half")),
      ]);
      expect(
        near(tall.width, short.width) &&
          near(tall.width, await spanWidth(column("Grows to half"), 12, 24)),
        "with grow, two columns of 6 out of 24 fill the row",
      ).toBe(true);
      expect(
        near(short.bottom, tall.bottom) && short.top > tall.top + 1,
        "align flex-end puts the shorter column level with the bottom of the taller one",
      ).toBe(true);
      const grown = column("Grows to half").locator("xpath=..");
      expect(await computed(grown, "justify-content")).toBe("center");
      expect(await computed(grown.locator("xpath=.."), "overflow")).toBe("hidden");
      expect(
        near(
          (await boxOf(column("Half of a wide container"))).width,
          await spanWidth(column("Half of a wide container"), 6, 12),
        ),
        "a 480 pixel container is past md, 20em",
      ).toBe(true);
      expect(
        near(
          (await boxOf(column("All of a narrow container"))).width,
          await spanWidth(column("All of a narrow container"), 12, 12),
        ),
        "a 240 pixel container is short of md",
      ).toBe(true);
      expect(
        near(
          (await boxOf(column("Half of a container past md"))).width,
          await spanWidth(column("Half of a container past md"), 6, 12),
        ),
        `without breakpoints, a 1024 pixel container is past the library's md, ${breakpointWidths.md}, whatever the viewport`,
      ).toBe(true);
      expect(
        near(
          (await boxOf(column("All of a container short of md"))).width,
          await spanWidth(column("All of a container short of md"), 12, 12),
        ),
        `without breakpoints, a 960 pixel container is short of the library's md, ${breakpointWidths.md}, whatever the viewport`,
      ).toBe(true);
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

  test("past the lg breakpoint, a Space's mih or miw from md still holds over its h or w", async () => {
    const { page, expected, close } = await openPage(browser(), url, {
      viewport: { width: lgBreakpointInPixels + 100, height: viewportHeight },
    });
    try {
      await expectTheKeyedSpaces(page, expected, "lg");
    } finally {
      await close();
    }
  });

  test("a page widened from one pixel below md to md passes the Box's checks and every layout check at md", async () => {
    const { page, expected, close } = await openPage(browser(), url, {
      viewport: { width: mdBreakpointInPixels - 1, height: viewportHeight },
    });
    try {
      await page.setViewportSize({ width: mdBreakpointInPixels, height: viewportHeight });

      await expectTheBoxCascade({ page, expected, fromMd: true });
      for (const [, check] of checks) await check({ page, expected, fromMd: true });
    } finally {
      await close();
    }
  });
});
