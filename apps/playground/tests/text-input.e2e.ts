import { describe } from "@e2e-dev/web";
import { expect } from "e2e";
import { paletteToken, primaryPalette } from "../../../packages/core/src/color-table";
import { committed, located, test } from "#/tests/support/e2e-playground.ts";
import type { Target } from "#/tests/support/targets.ts";

const email: Target = { role: "textbox", name: "Email" };
const overridden: Target = { role: "textbox", name: "Overridden input" };
const disabled: Target = { role: "textbox", name: "Disabled input" };
const invalidAddress = "not an address";

describe("a text input in a freshly hydrated page", () => {
  test("has the library's border, height, background and text colour", async ({
    expected,
    styleOf,
  }) => {
    expect(await styleOf(email, "border-top-color")).toBe(expected("--solix-color-border"));
    expect(await styleOf(email, "height")).toBe(expected("--solix-control-height-md"));
    expect(await styleOf(email, "border-top-left-radius")).toBe(expected("--solix-radius-md"));
    expect(await styleOf(email, "background-color")).toBe(expected("--solix-color-body"));
    expect(await styleOf(email, "color")).toBe(expected("--solix-color-text"));
  });

  test("a consumer's plain class beats the library's background, and the height stays the library's", async ({
    expected,
    styleOf,
  }) => {
    expect(await styleOf(overridden, "background-color")).toBe(expected("danger"));
    expect(await styleOf(overridden, "height")).toBe(expected("--solix-control-height-md"));
  });

  test("keeps the primary border, not the error border, while an invalid value is typed and not yet committed", async ({
    expected,
    styleOf,
    screen,
  }) => {
    const field = located(screen, email);

    await field.fill(invalidAddress);

    await expect(field).toHaveValue(invalidAddress);
    await expect
      .poll(() => styleOf(email, "border-top-color"))
      .toBe(expected(paletteToken(primaryPalette, "6")));
  });

  test("shows the error border once the user commits an invalid value", async ({
    expected,
    styleOf,
    screen,
  }) => {
    await committed(screen, email, invalidAddress);

    await expect
      .poll(() => styleOf(email, "border-top-color"))
      .toBe(expected("--solix-color-error"));
  });

  test("takes the library's border back once the user commits a valid value", async ({
    expected,
    styleOf,
    screen,
  }) => {
    await committed(screen, email, invalidAddress);
    await expect
      .poll(() => styleOf(email, "border-top-color"))
      .toBe(expected("--solix-color-error"));

    await committed(screen, email, "someone@example.com");

    await expect
      .poll(() => styleOf(email, "border-top-color"))
      .toBe(expected("--solix-color-border"));
  });

  test("takes the primary border while it has keyboard focus", async ({
    expected,
    styleOf,
    screen,
    browser,
  }) => {
    await located(screen, email).focus();
    await browser.keyboard.press("ArrowRight");

    await expect
      .poll(() => styleOf(email, "border-top-color"))
      .toBe(expected(paletteToken(primaryPalette, "6")));
  });

  test("looks disabled and cannot be typed in when disabled", async ({ styleOf, screen }) => {
    expect(await styleOf(disabled, "opacity")).toBe("0.6");
    expect(await styleOf(disabled, "cursor")).toBe("not-allowed");
    await expect(located(screen, disabled)).toBeDisabled();
  });
});
