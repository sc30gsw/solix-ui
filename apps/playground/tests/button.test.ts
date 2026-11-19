import { afterAll, beforeAll, describe, expect, inject, test } from "vite-plus/test";
import { rootPart, stableClass } from "../../../packages/core/tests/built-library";
import { lookOf } from "../../../scripts/expected-values";
import {
  computed,
  inEveryEngine,
  openPage,
  type OpenPage,
  scriptModes,
} from "#/tests/support/playground.ts";

const url = inject("playgroundUrl");

inEveryEngine((browser) => {
  describe.each(scriptModes)("a Button with scripts %s", (_, javaScriptEnabled) => {
    let opened: OpenPage;

    beforeAll(async () => {
      opened = await openPage(browser(), url, { javaScriptEnabled });
    });

    afterAll(async () => {
      await opened.close();
    });

    test("a button named Default is on the page and has the library's background, text colour and height", async () => {
      const { page, expected } = opened;
      const button = page.getByRole("button", { name: "Default" });

      expect(await computed(button, "background-color")).toBe(expected("--solix-color-primary"));
      expect(await computed(button, "color")).toBe(expected("--solix-color-on-primary"));
      expect(await computed(button, "height")).toBe(expected("--solix-control-height-md"));
    });

    test("a consumer's plain class beats the library default it targets, and nothing else", async () => {
      const { page, expected } = opened;
      const overridden = page.getByTestId("overridden");

      expect(await computed(overridden, "background-color")).toBe(expected("danger"));
      expect(await computed(overridden, "color")).toBe(expected("--solix-color-on-primary"));
      expect(await computed(overridden, "height")).toBe(expected("--solix-control-height-md"));
      expect(await computed(overridden, "border-top-left-radius")).toBe(
        expected("--solix-radius-md"),
      );
    });

    test("a consumer's rule for the class that classes.root names beats the library's style it targets, and nothing else", async () => {
      const { page, expected } = opened;
      const button = page.getByRole("button", { name: "Class from classes.root" });

      expect(await computed(button, "background-color")).toBe(expected("danger"));
      expect(await computed(button, "color")).toBe(expected("--solix-color-on-primary"));
      expect(await computed(button, "height")).toBe(expected("--solix-control-height-md"));
    });

    test("unstyled leaves a button that looks like a button the library does not style, and keeps the stable class", async () => {
      const button = opened.page.getByRole("button", { name: "Unstyled" });

      expect(
        await lookOf(button),
        "packages/core/src/parts.ts: with unstyled, leave out the library's classes, so the Unstyled button looks like the Plain button the library does not style, in every property lookOf reads",
      ).toEqual(await lookOf(opened.page.getByRole("button", { name: "Plain button" })));
      expect((await button.getAttribute("class"))?.split(/\s+/)).toContain(
        stableClass("Button", rootPart),
      );
    });
  });
});
