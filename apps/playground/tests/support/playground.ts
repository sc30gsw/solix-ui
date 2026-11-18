import { join } from "node:path";
import type { Browser, BrowserContextOptions, Page } from "playwright";
import { expectedValues } from "../../../../scripts/expected-values";
import { openedAndHydrated, openedBeforeHydration } from "#/tests/support/opening.ts";

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
  consoleProblems: string[];
  close: () => Promise<void>;
};

export async function openPage(
  browser: Browser,
  url: string,
  options: BrowserContextOptions = {},
): Promise<OpenPage> {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const consoleProblems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      consoleProblems.push(message.text());
    }
  });
  page.on("pageerror", (error) => consoleProblems.push(String(error)));
  await (options.javaScriptEnabled === false
    ? openedBeforeHydration(page, url, "load")
    : openedAndHydrated(page, url));
  const expected = await expectedValues(page, { sentinels: true });
  return { page, expected, consoleProblems, close: () => context.close() };
}
