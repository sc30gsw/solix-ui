import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { browserType, enginesToVerify } from "../../../scripts/browser-engines.mjs";
import { breakpointWidths } from "../src/style-prop-table";
import { dist, library } from "./built-library";
import { fixtures, polymorphicComponents, render } from "./fixtures";

const stylesheet = readFileSync(join(dist, "styles.css"), "utf8");
const pixelsPerMediaQueryEm = 16;
const mdWidth = Number.parseFloat(breakpointWidths.md) * pixelsPerMediaQueryEm;
const viewportHeight = 800;

const wrappedModals = [
  { label: "Open, hidden from md", opened: true, props: { hiddenFrom: "md" } },
  { label: "Open, visible from xl", opened: true, props: { visibleFrom: "xl" } },
  { label: "Closed, shown as flex", opened: false, props: { display: "flex" } },
];

function dialogNamed(page: Page, label: string) {
  return page.locator("dialog").filter({ hasText: label });
}

describe.each(enginesToVerify())("in %s", (engine) => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await browserType(engine).launch();
  });

  afterAll(async () => {
    await browser.close();
  });

  test.each(polymorphicComponents)(
    "a Modal that %s wraps, at the md breakpoint, shows while it is open and hides while it is closed, whatever display, hiddenFrom or visibleFrom it is given",
    async (name) => {
      const page = await browser.newPage({ viewport: { width: mdWidth, height: viewportHeight } });
      const markup = wrappedModals.map(({ label, props }) =>
        render(name, {
          ...fixtures.Modal.props,
          component: library.Modal,
          label,
          ...props,
        }),
      );
      await page.setContent(`<style>${stylesheet}</style><main>${markup.join("")}</main>`);
      for (const { label, opened } of wrappedModals) {
        if (opened) {
          await dialogNamed(page, label).evaluate((dialog: HTMLDialogElement) =>
            dialog.showModal(),
          );
        }
      }

      for (const { label, opened } of wrappedModals) {
        expect(await dialogNamed(page, label).isVisible(), label).toBe(opened);
      }

      await page.close();
    },
  );
});
