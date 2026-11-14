import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Locator, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { computed, inEveryEngine, serveApp } from "../../../tests/support/served-app";

const port = 4327;
const appDirectory = join(import.meta.dirname, "..");
const repositoryRoot = join(appDirectory, "../..");
const url = serveApp({
  directory: appDirectory,
  port,
  command: [
    join(repositoryRoot, "node_modules/.bin/vp"),
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
});
const libraryStylesheet = readFileSync(
  join(repositoryRoot, "packages/core/dist/styles.css"),
  "utf8",
);
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
      await page.goto(url, { waitUntil: "networkidle" });
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

    test("a StyleX block that sets --solix-color-primary on a wrapper themes the library's components inside it", async () => {
      const themed = page.getByRole("button", { name: "StyleX theme" });

      expect(await background(themed)).toBe(await background(page.getByTestId("theme reference")));
      expect(await background(themed)).not.toBe(
        await background(page.getByRole("button", { name: "Library default" })),
      );
    });
  });
});
