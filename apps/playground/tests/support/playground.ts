import { join } from "node:path";
import type { Browser, BrowserContextOptions, Page } from "playwright";
import { expectedValues } from "../../../../scripts/expected-values";
import { opened } from "#/tests/support/opening.ts";

export { computed, inEveryEngine } from "../../../../tests/support/served-app";

export const appDirectory = join(import.meta.dirname, "../..");

export const scriptModes: [label: string, javaScriptEnabled: boolean][] = [
  ["on", true],
  ["off", false],
];

export type Expected = Awaited<ReturnType<typeof expectedValues>>;

export type OpenPage = {
  page: Page;
  expected: Expected;
  close: () => Promise<void>;
};

export async function openPage(
  browser: Browser,
  url: string,
  options: BrowserContextOptions = {},
  { sentinels = true }: { sentinels?: boolean } = {},
): Promise<OpenPage> {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  await opened(page, url, options.javaScriptEnabled === false ? "load" : "hydrated");
  const expected = await expectedValues(page, { sentinels });
  return { page, expected, close: () => context.close() };
}
