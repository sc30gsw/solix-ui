import type { Locator, Page } from "playwright";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import {
  computed,
  type Expected,
  inEveryEngine,
  openPage,
  type OpenPage,
  servePlayground,
} from "./support/playground";

const port = 4324;
const url = servePlayground(port);

inEveryEngine((browser) => {
  describe("a text input in a freshly hydrated page", () => {
    let opened: OpenPage;
    let page: Page;
    let expected: Expected;
    let email: Locator;

    beforeEach(async () => {
      opened = await openPage(browser(), url);
      ({ page, expected } = opened);
      email = page.getByRole("textbox", { name: "Email" });
    });

    afterEach(async () => {
      await opened.close();
    });

    test("has the library's border, and a consumer's plain class beats its background", async () => {
      const overridden = page.getByRole("textbox", { name: "Overridden input" });

      expect(await computed(email, "border-top-color")).toBe(expected("--solix-color-border"));
      expect(await computed(email, "border-top-left-radius")).toBe(expected("--solix-radius-md"));
      expect(await computed(email, "background-color")).toBe(expected("--solix-color-body"));
      expect(await computed(email, "color")).toBe(expected("--solix-color-text"));
      expect(await computed(overridden, "background-color")).toBe(expected("danger"));
      expect(await computed(overridden, "height")).toBe(expected("--solix-control-height-md"));
    });

    test("shows the error border only after the user has committed an invalid value", async () => {
      await email.fill("not an address");
      await expect
        .poll(() => computed(email, "border-top-color"))
        .not.toBe(expected("--solix-color-error"));

      await page.getByRole("button", { name: "Default" }).focus();
      await expect
        .poll(() => computed(email, "border-top-color"))
        .toBe(expected("--solix-color-error"));

      await email.fill("someone@example.com");
      await page.getByRole("button", { name: "Default" }).focus();
      await expect
        .poll(() => computed(email, "border-top-color"))
        .toBe(expected("--solix-color-border"));
    });

    test("takes the primary border while it has keyboard focus", async () => {
      await email.focus();
      await page.keyboard.press("ArrowRight");

      await expect
        .poll(() => computed(email, "border-top-color"))
        .toBe(expected("--solix-color-primary"));
    });

    test("looks disabled and cannot be typed in when disabled", async () => {
      const disabled = page.getByRole("textbox", { name: "Disabled input" });

      expect(await computed(disabled, "opacity")).toBe("0.6");
      expect(await computed(disabled, "cursor")).toBe("not-allowed");
      expect(await disabled.isEditable()).toBe(false);
    });
  });

  test("a text input has the library's border with scripts turned off", async () => {
    const { page, expected, close } = await openPage(browser(), url, { javaScriptEnabled: false });

    expect(await computed(page.getByRole("textbox", { name: "Email" }), "border-top-color")).toBe(
      expected("--solix-color-border"),
    );

    await close();
  });
});
