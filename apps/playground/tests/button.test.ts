import { afterAll, beforeAll, describe, expect, inject, test } from "vite-plus/test";
import {
  ownPaletteOf,
  type Palette,
  palettes,
  paletteToken,
  primaryPalette,
} from "../../../packages/core/src/color-table";
import {
  library,
  rootPart,
  stableClass,
  themeStyleSheet,
} from "../../../packages/core/tests/built-library";
import { lookOf } from "../../../scripts/expected-values";
import { nestedThemeNames, nestedThemes } from "#/src/sections/theme-setups.ts";
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

    test("a consumer's plain class beats the library default it targets, and nothing else", async () => {
      const { page, expected } = opened;
      const overridden = page.getByTestId("overridden");

      expect(await computed(page.getByTestId("default"), "background-color")).toBe(
        expected(paletteToken(primaryPalette, "6")),
      );
      expect(await computed(overridden, "background-color")).toBe(expected("danger"));
      expect(await computed(overridden, "color")).toBe(
        expected(paletteToken(primaryPalette, "contrast")),
      );
      expect(await computed(overridden, "height")).toBe(expected("--solix-control-height-sm"));
      expect(await computed(overridden, "border-top-left-radius")).toBe(
        expected("--solix-radius-3xl"),
      );
    });

    test("a theme's primaryColor re-themes the Button, its hover and its light variant, the selected tab, the open disclosure, the focused text input and the focus ring", async () => {
      const { page, expected } = opened;
      const other = palettes.find((palette) => palette !== primaryPalette) ?? primaryPalette;
      const shade = (name: Parameters<typeof paletteToken>[1]) =>
        expected(paletteToken(other, name));
      const rule = themeStyleSheet(library.createTheme({ primaryColor: other }), ":root");
      await page.evaluate((text) => {
        const style = document.createElement("style");
        style.nonce = document.querySelector<HTMLElement>("[nonce]")?.nonce ?? "";
        style.id = "primary-override";
        style.textContent = text;
        document.head.append(style);
      }, rule ?? "");
      const button = page.getByTestId("default");
      const selectedTab = page.getByRole("tab", { selected: true }).first();
      const summary = page.locator("summary", { hasText: "Toggle" });

      try {
        await expect.poll(() => computed(button, "background-color")).toBe(shade("6"));
        expect(await computed(button, "outline-color")).toBe(shade("6"));
        await expect
          .poll(() => computed(page.getByTestId("light"), "background-color"))
          .toBe(shade("1"));
        await expect.poll(() => computed(selectedTab, "border-bottom-color")).toBe(shade("6"));
        await expect.poll(() => computed(selectedTab, "color")).toBe(shade("9"));
        await button.hover();
        await expect.poll(() => computed(button, "background-color")).toBe(shade("7"));
        await summary.click();
        await expect.poll(() => computed(summary, "background-color")).toBe(shade("6"));
        await summary.click();
        const email = page.getByRole("textbox", { name: "Email" });
        await email.focus();
        await page.keyboard.press("ArrowRight");
        await expect.poll(() => computed(email, "border-top-color")).toBe(shade("6"));
      } finally {
        await page.evaluate(() => document.getElementById("primary-override")?.remove());
        await page.getByRole("heading").first().hover();
      }
    });

    test.each([
      [nestedThemeNames.outerIsland, nestedThemes.outer, nestedThemes.inner],
      [nestedThemeNames.innerScope, nestedThemes.inner, nestedThemes.outer],
      [nestedThemeNames.innerIsland, nestedThemes.inner, nestedThemes.outer],
    ])(
      "the nearest provider's primaryColor paints %s, in that element's own scheme, under an outer provider whose selector is an id",
      async (name, nearest, outer) => {
        const button = opened.page.getByRole("button", { name });
        const paletteHere = (primaryColor: Palette) =>
          button.evaluate(
            (element, token) => {
              const probe = document.createElement("span");
              probe.style.color = `var(${token})`;
              element.append(probe);
              const colour = getComputedStyle(probe).color;
              probe.remove();
              return colour;
            },
            paletteToken(ownPaletteOf(primaryColor), "6"),
          );
        const wanted = await paletteHere(nearest.primaryColor);

        expect(wanted).not.toBe(await paletteHere(outer.primaryColor));
        expect(await computed(button, "background-color")).toBe(wanted);
      },
    );

    test("a consumer's rule for the class that classes.root names beats the library's style it targets, and nothing else", async () => {
      const { page, expected } = opened;
      const button = page.getByRole("button", { name: "Class from classes.root" });

      expect(await computed(button, "background-color")).toBe(expected("danger"));
      expect(await computed(button, "color")).toBe(
        expected(paletteToken(primaryPalette, "contrast")),
      );
      expect(await computed(button, "height")).toBe(expected("--solix-control-height-sm"));
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
