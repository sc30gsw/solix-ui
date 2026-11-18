import { join } from "node:path";
import type { Browser, BrowserContextOptions, Page } from "playwright";
import { expectedValues } from "../../../../scripts/expected-values";

export { computed, inEveryEngine } from "../../../../tests/support/served-app";

export const appDirectory = join(import.meta.dirname, "../..");

export const scriptModes: [label: string, javaScriptEnabled: boolean][] = [
  ["on", true],
  ["off", false],
];

export const pageDidNotBecomeReady = "the page did not become ready";

export async function hydrated(page: Page, options: { timeout?: number } = {}): Promise<void> {
  try {
    await page.waitForFunction(
      () => {
        const probes = [...document.querySelectorAll("output[data-hydration-probe]")];
        return probes.length > 0 && probes.every((probe) => probe.hasAttribute("data-hydrated-as"));
      },
      undefined,
      options,
    );
  } catch (cause) {
    throw new Error(
      `${pageDidNotBecomeReady}: its client script has not claimed every hydration probe of the server's markup.`,
      { cause },
    );
  }
}

export async function openedAndHydrated(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "networkidle" });
  await hydrated(page);
}

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
  await page.goto(url, {
    waitUntil: options.javaScriptEnabled === false ? "load" : "networkidle",
  });
  const expected = await expectedValues(page, { sentinels: true });
  return { page, expected, consoleProblems, close: () => context.close() };
}
