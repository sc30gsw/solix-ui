import type { Locator, Page } from "playwright";
import { afterEach, beforeEach, describe, expect, inject, test } from "vite-plus/test";
import {
  computed,
  type Expected,
  inEveryEngine,
  openPage,
  type OpenPage,
} from "./support/playground";

const url = inject("playgroundUrl");

inEveryEngine((browser) => {
  describe("a modal in a freshly hydrated page", () => {
    let opened: OpenPage;
    let page: Page;
    let expected: Expected;
    let dialog: Locator;
    let opener: Locator;
    let readout: Locator;

    beforeEach(async () => {
      opened = await openPage(browser(), url);
      ({ page, expected } = opened);
      dialog = page.getByRole("dialog", { name: "Settings" });
      opener = page.getByRole("button", { name: "Open modal" });
      readout = page.getByText(/^The app records the modal as/);
    });

    afterEach(async () => {
      await opened.close();
    });

    test("starts closed and opens as a modal over the page when the app asks", async () => {
      expect(await dialog.count()).toBe(0);

      await opener.click();

      await dialog.waitFor({ state: "visible" });
      expect(await dialog.evaluate((node) => node.matches(":modal"))).toBe(true);
      expect(await dialog.getByRole("heading", { name: "Settings" }).isVisible()).toBe(true);
      expect(await computed(dialog, "background-color")).toBe(expected("--solix-color-body"));
      expect(await computed(dialog, "color")).toBe(expected("--solix-color-text"));
      expect(await computed(dialog, "border-top-color")).toBe(expected("--solix-color-border"));
      expect(await computed(dialog, "border-top-left-radius")).toBe(expected("--solix-radius-md"));
      expect(
        await dialog.evaluate((node) => getComputedStyle(node, "::backdrop").backgroundColor),
      ).toBe(expected("--solix-color-backdrop"));
      await expect.poll(() => readout.textContent()).toBe("The app records the modal as opened.");
    });

    test("tells the app it closed, whichever way the user closed it", async () => {
      const closers: [string, () => Promise<void>][] = [
        ["the Escape key", () => page.keyboard.press("Escape")],
        ["the Close button", () => dialog.getByRole("button", { name: "Close" }).click()],
        ["a press outside the dialog", () => page.mouse.click(2, 2)],
      ];

      for (const [, close] of closers) {
        await opener.click();
        await dialog.waitFor({ state: "visible" });

        await close();

        await dialog.waitFor({ state: "hidden" });
        await expect.poll(() => readout.textContent()).toBe("The app records the modal as closed.");
      }
    });

    test("stays open when the user presses inside it", async () => {
      await opener.click();
      await dialog.waitFor({ state: "visible" });

      await dialog.getByText("Modal content").click();
      await dialog.getByRole("textbox", { name: "Name" }).click();

      expect(await dialog.isVisible()).toBe(true);
      await expect.poll(() => readout.textContent()).toBe("The app records the modal as opened.");
    });
  });

  test("a modal stays closed with scripts turned off", async () => {
    const { page, close } = await openPage(browser(), url, { javaScriptEnabled: false });

    expect(await page.locator("dialog").isVisible()).toBe(false);

    await close();
  });
});
