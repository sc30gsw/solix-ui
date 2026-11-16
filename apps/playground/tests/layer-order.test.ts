import { createComponent, renderToString } from "@solidjs/web";
import type { Browser } from "playwright";
import { describe, expect, test } from "vite-plus/test";
import { library, stylesheet } from "../../../packages/core/tests/built-library";
import { inEveryEngine } from "./support/playground";

const origin = "http://layer-order.test";
const sheet = `<link rel="stylesheet" href="${origin}/styles.css">`;
const containerWidth = 600;
const breakpoints = { xs: "5em", sm: "10em", md: "20em", lg: "60em", xl: "70em" } as const;

const markup = renderToString(() =>
  createComponent(library.Grid, {
    type: "container",
    breakpoints,
    get children() {
      return [
        createComponent(library.GridCol, { span: { base: 12, md: 6 }, children: "Half" }),
        createComponent(library.GridCol, { span: { base: 12, md: 6 }, children: "Other half" }),
      ];
    },
  }),
);

const pages: [where: string, html: string][] = [
  [
    "in the head",
    `<!doctype html><html><head>${sheet}</head><body><div style="width:${containerWidth}px">${markup}</div></body></html>`,
  ],
  [
    "after the markup, as a page that streams its styles does",
    `<!doctype html><html><head></head><body><div style="width:${containerWidth}px">${markup}</div>${sheet}</body></html>`,
  ],
];

async function columnShare(browser: Browser, html: string): Promise<number> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route(`${origin}/**`, (route) =>
    new URL(route.request().url()).pathname === "/styles.css"
      ? route.fulfill({ contentType: "text/css", body: stylesheet })
      : route.fulfill({ contentType: "text/html", body: html }),
  );
  await page.goto(`${origin}/`);
  const share = await page
    .getByText("Half", { exact: true })
    .evaluate(
      (column) =>
        column.getBoundingClientRect().width /
        (column.parentElement?.getBoundingClientRect().width ?? 1),
    );
  await context.close();
  return share;
}

inEveryEngine((browser) => {
  describe.each(pages)("with the library's stylesheet linked %s", (_, html) => {
    test("a column a container query gives 6 of 12 takes about half its row, so the query's rule outranks the column's own default", async () => {
      const share = await columnShare(browser(), html);

      expect(share).toBeGreaterThan(0.4);
      expect(share).toBeLessThan(0.5);
    });
  });
});
