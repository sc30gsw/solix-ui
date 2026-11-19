import type { Page } from "playwright";
import { expect } from "vite-plus/test";
import { computed, type Expected } from "#/tests/support/playground.ts";

export async function expectTheBoxCascade({
  page,
  expected,
  fromMd,
}: {
  page: Page;
  expected: Expected;
  fromMd: boolean;
}): Promise<void> {
  const text = (content: string) => page.getByText(content, { exact: true });

  expect(
    await computed(
      page.getByRole("button", { name: "Background from a style prop" }),
      "background-color",
    ),
    "the style prop beats the component default",
  ).toBe(expected("--solix-color-error"));
  expect(await computed(text("Style prop margin"), "margin-top")).toBe(
    expected("--solix-spacing-xl"),
  );
  expect(
    await computed(text("Consumer class margin"), "margin-top"),
    "the consumer's class beats the style prop",
  ).toBe(expected("roomy"));
  expect(
    await computed(text("Consumer style margin"), "margin-top"),
    "the consumer's style beats the consumer's class and the style prop",
  ).toBe(expected("pinnedMargin"));
  expect(
    await computed(page.getByRole("region", { name: "Style props" }), "padding-top"),
    "the responsive padding switches from its xs value to its md value at md",
  ).toBe(expected(fromMd ? "--solix-spacing-lg" : "--solix-spacing-sm"));
  expect(
    await computed(text("Longhand padding"), "padding-top"),
    "the pt longhand beats the p shorthand, at its base and at its md value",
  ).toBe(expected("zero"));
  expect(
    await computed(text("Longhand padding"), "padding-bottom"),
    "the p shorthand still sets the sides pt leaves alone",
  ).toBe(expected(fromMd ? "--solix-spacing-lg" : "--solix-spacing-xs"));
  expect(
    await computed(text("Unset margin"), "margin-top"),
    "mt=unset inside a Box with mt=xl does not take the outer Box's margin",
  ).toBe(expected("zero"));
  expect(await text("Hidden from md").isVisible(), "hiddenFrom md").toBe(!fromMd);
  expect(await text("Visible from md").isVisible(), "visibleFrom md").toBe(fromMd);
}
