import { join } from "node:path";
import type { Browser, BrowserContextOptions, Page } from "playwright";
import { expect } from "vite-plus/test";
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

export type OpenPageOptions = {
  sentinels?: boolean;
  reportsToTheConsoleBecause?: string;
};

export async function openPage(
  browser: Browser,
  url: string,
  options: BrowserContextOptions = {},
  { sentinels = true, reportsToTheConsoleBecause }: OpenPageOptions = {},
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
  await opened(page, url, options.javaScriptEnabled === false ? "load" : "hydrated");
  const expected = await expectedValues(page, { sentinels });
  return {
    page,
    expected,
    close: async () => {
      await context.close();
      if (reportsToTheConsoleBecause === undefined) {
        expect(
          consoleProblems,
          "the console errors and warnings the page reported while it was open. Fix their cause, or pass openPage the reason the page must report them as reportsToTheConsoleBecause.",
        ).toEqual([]);
      } else {
        expect(
          consoleProblems,
          `the page was opened as one that reports to the console because ${reportsToTheConsoleBecause}, and it reported nothing. Remove reportsToTheConsoleBecause.`,
        ).not.toEqual([]);
      }
    },
  };
}
