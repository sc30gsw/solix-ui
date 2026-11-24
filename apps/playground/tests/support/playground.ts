import { join } from "node:path";
import type { Browser, BrowserContextOptions, Locator, Page } from "playwright";
import {
  type Expected,
  expectedValues,
  type ProbeReader,
} from "../../../../scripts/expected-values";
import { opened } from "#/tests/support/opening.ts";

export { computed, inEveryEngine } from "../../../../tests/support/served-app";

export type { Expected } from "../../../../scripts/expected-values";

export const appDirectory = join(import.meta.dirname, "../..");

export const scriptModes: [label: string, javaScriptEnabled: boolean][] = [
  ["on", true],
  ["off", false],
];

const sides = ["top", "right", "bottom", "left"];
const corners = ["top-left", "top-right", "bottom-right", "bottom-left"];
const lookProperties = [
  "background-color",
  "color",
  ...sides.flatMap((side) => ["width", "style", "color"].map((part) => `border-${side}-${part}`)),
  ...corners.map((corner) => `border-${corner}-radius`),
  "height",
  ...sides.map((side) => `padding-${side}`),
];

export type OpenPage = {
  page: Page;
  expected: Expected;
  close: () => Promise<void>;
};

export function readerOf(page: Page): ProbeReader {
  return (probe, input) => page.evaluate(probe, input);
}

export async function openPage(
  browser: Browser,
  url: string,
  options: BrowserContextOptions = {},
  { sentinels }: { sentinels?: boolean } = {},
): Promise<OpenPage> {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  await opened(page, url, options.javaScriptEnabled === false ? "load" : "hydrated");
  const expected = await expectedValues(readerOf(page), { sentinels });
  return { page, expected, close: () => context.close() };
}

export function lookOf(element: Locator): Promise<Record<string, string>> {
  return element.evaluate(
    (node, properties) =>
      Object.fromEntries(
        properties.map((property) => [property, getComputedStyle(node).getPropertyValue(property)]),
      ),
    lookProperties,
  );
}
