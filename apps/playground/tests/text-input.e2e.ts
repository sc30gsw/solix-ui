import { afterEach, describe } from "@e2e-dev/web";
import { expect } from "e2e";
import { paletteToken, primaryPalette } from "../../../packages/core/src/color-table";
import { consoleProblems, labelled, test } from "#/tests/support/e2e-playground.ts";

const emailName = "Email";
const email = labelled(emailName);
const invalidAddress = "not an address";

describe("a text input in a freshly hydrated page", () => {
  afterEach(async ({ browser }) => {
    expect(
      await consoleProblems(browser),
      "the console errors, warnings and page errors that the page reported during this test. Fix their cause.",
    ).toEqual([]);
  });

  test("has the library's border, height, background and text colour", async ({
    playground,
    screen,
  }) => {
    const { expected, styleOf } = playground;
    await screen.getByRole("textbox", emailName).waitFor();

    expect(await styleOf(email, "border-top-color")).toBe(expected("--solix-color-border"));
    expect(await styleOf(email, "height")).toBe(expected("--solix-control-height-md"));
    expect(await styleOf(email, "border-top-left-radius")).toBe(expected("--solix-radius-md"));
    expect(await styleOf(email, "background-color")).toBe(expected("--solix-color-body"));
    expect(await styleOf(email, "color")).toBe(expected("--solix-color-text"));
  });

  test("a consumer's plain class beats the library's background, and the height stays the library's", async ({
    playground,
    screen,
  }) => {
    const { expected, styleOf } = playground;
    const overriddenName = "Overridden input";
    const overridden = labelled(overriddenName);
    await screen.getByRole("textbox", overriddenName).waitFor();

    expect(await styleOf(overridden, "background-color")).toBe(expected("danger"));
    expect(await styleOf(overridden, "height")).toBe(expected("--solix-control-height-md"));
  });

  test("keeps the library's border while an invalid value is typed and not yet committed", async ({
    playground,
    screen,
  }) => {
    const { expected, styleOf } = playground;

    await screen.getByRole("textbox", emailName).fill(invalidAddress);

    await expect
      .poll(() => styleOf(email, "border-top-color"))
      .not.toBe(expected("--solix-color-error"));
  });

  test("shows the error border once the user commits an invalid value", async ({
    playground,
    screen,
  }) => {
    const { expected, styleOf } = playground;
    await screen.getByRole("textbox", emailName).fill(invalidAddress);

    await screen.getByRole("button", "Default").focus();

    await expect
      .poll(() => styleOf(email, "border-top-color"))
      .toBe(expected("--solix-color-error"));
  });

  test("takes the library's border back once the user commits a valid value", async ({
    playground,
    screen,
  }) => {
    const { expected, styleOf } = playground;
    const field = screen.getByRole("textbox", emailName);
    const elsewhere = screen.getByRole("button", "Default");
    await field.fill(invalidAddress);
    await elsewhere.focus();
    await expect
      .poll(() => styleOf(email, "border-top-color"))
      .toBe(expected("--solix-color-error"));

    await field.fill("someone@example.com");
    await elsewhere.focus();

    await expect
      .poll(() => styleOf(email, "border-top-color"))
      .toBe(expected("--solix-color-border"));
  });

  test("takes the primary border while it has keyboard focus", async ({
    playground,
    screen,
    browser,
  }) => {
    const { expected, styleOf } = playground;

    await screen.getByRole("textbox", emailName).focus();
    await browser.keyboard.press("ArrowRight");

    await expect
      .poll(() => styleOf(email, "border-top-color"))
      .toBe(expected(paletteToken(primaryPalette, "6")));
  });

  test("looks disabled and cannot be typed in when disabled", async ({ playground, screen }) => {
    const { styleOf } = playground;
    const disabledName = "Disabled input";
    const disabled = labelled(disabledName);

    expect(await styleOf(disabled, "opacity")).toBe("0.6");
    expect(await styleOf(disabled, "cursor")).toBe("not-allowed");
    await expect(screen.getByRole("textbox", disabledName)).toBeDisabled();
  });
});
