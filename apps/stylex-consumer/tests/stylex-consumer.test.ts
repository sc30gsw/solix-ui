import { join } from "node:path";
import type { Locator, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { stylesheet as libraryStylesheet } from "../../../packages/core/tests/built-library";
import { installedVp } from "../../../scripts/repository";
import { computed, inEveryEngine, serveApp } from "../../../tests/support/served-app";
import { viteOnAFreePort } from "../../../tests/support/server-process";

const appDirectory = join(import.meta.dirname, "..");
const url = serveApp({
  directory: appDirectory,
  command: [installedVp, "preview", ...viteOnAFreePort],
});
const arrangements: [label: string, libraryLast: boolean][] = [
  ["as the bundle orders them", false],
  ["with the library's stylesheet loaded again after every other", true],
];

function background(element: Locator): Promise<string> {
  return computed(element, "background-color");
}

inEveryEngine((browser) => {
  describe.each(arrangements)("with the stylesheets %s", (_, libraryLast) => {
    let page: Page;

    beforeAll(async () => {
      page = await browser().newPage();
      await page.goto(url(), { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "StyleX class" }).waitFor();
      if (libraryLast) await page.addStyleTag({ content: libraryStylesheet });
    });

    afterAll(async () => {
      await page.close();
    });

    test("a consumer's StyleX class passed through class beats the library's background on a component, and nothing else", async () => {
      const styled = page.getByRole("button", { name: "StyleX class" });
      const libraryDefault = page.getByRole("button", { name: "Library default" });

      expect(await background(styled)).toBe(await background(page.getByTestId("class reference")));
      expect(await background(styled)).not.toBe(await background(libraryDefault));
      expect(await computed(styled, "color")).toBe(await computed(libraryDefault, "color"));
      expect(await computed(styled, "height")).toBe(await computed(libraryDefault, "height"));
    });

    test("a consumer's StyleX class passed through classes.summary beats the library's background on that part", async () => {
      const styled = page.locator("summary").filter({ hasText: "StyleX summary" });
      const libraryDefault = page.locator("summary").filter({ hasText: "Library summary" });

      expect(await background(styled)).toBe(
        await background(page.getByTestId("summary reference")),
      );
      expect(await background(styled)).not.toBe(await background(libraryDefault));
      expect(await computed(styled, "cursor")).toBe(await computed(libraryDefault, "cursor"));
    });

    test("a provider whose theme's primaryColor names another palette, scoped to a wrapper by cssVariablesSelector, themes the library's components inside it, as a StyleX block that reads the primary's alias there sees", async () => {
      const themed = page.getByRole("button", { name: "Themed by primaryColor" });

      expect(await background(themed)).toBe(await background(page.getByTestId("theme reference")));
      expect(await background(themed)).not.toBe(
        await background(page.getByRole("button", { name: "Library default" })),
      );
    });
  });
});
