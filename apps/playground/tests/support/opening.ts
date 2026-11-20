import type { ConsoleMessage, Page } from "playwright";
import { hydratedMark } from "#/src/hydrated-mark.ts";

export type OpenedUntil = "hydrated" | "stylesheetsLoaded" | "commit" | "load";

export const pageDidNotBecomeReady = "the page did not become ready";

export const hydrationTimeout = 10_000;

export type ExpectedReport = string | RegExp;

type Heard = { problems: string[]; asked: number; expected?: ExpectedReport };

function isExpected(problem: string, expected: ExpectedReport | undefined): boolean {
  if (expected === undefined) return false;
  return typeof expected === "string" ? problem === expected : expected.test(problem);
}

const heardOnEachPage = new Map<Page, Heard>();

function problemOf(message: ConsoleMessage): string | undefined {
  const type = message.type();
  return type === "error" || type === "warning" ? `${type}: ${message.text()}` : undefined;
}

function keepListening(page: Page, expected: ExpectedReport | undefined): void {
  let heard = heardOnEachPage.get(page);
  if (heard === undefined) {
    const kept: Heard = { problems: [], asked: 0 };
    page.on("console", (message) => {
      const problem = problemOf(message);
      if (problem !== undefined) kept.problems.push(problem);
    });
    page.on("pageerror", (error) => kept.problems.push(`pageerror: ${String(error)}`));
    heardOnEachPage.set(page, kept);
    heard = kept;
  }
  if (expected !== undefined) heard.expected = expected;
}

export function consoleProblemsSinceLastAsked(): string[] {
  const found: string[] = [];
  for (const [page, heard] of heardOnEachPage) {
    found.push(
      ...heard.problems
        .slice(heard.asked)
        .filter((problem) => !isExpected(problem, heard.expected)),
    );
    heard.asked = heard.problems.length;
    if (page.isClosed()) heardOnEachPage.delete(page);
  }
  return found;
}

function heardFrom(page: Page): { said: string[]; stop: () => void } {
  const said: string[] = [];
  const onConsole = (message: ConsoleMessage) => said.push(`${message.type()}: ${message.text()}`);
  const onError = (error: Error) => said.push(`pageerror: ${String(error)}`);
  page.on("console", onConsole);
  page.on("pageerror", onError);
  return {
    said,
    stop: () => {
      page.off("console", onConsole);
      page.off("pageerror", onError);
    },
  };
}

function notReady(timeout: number, said: string[], cause: unknown): Error {
  return new Error(
    `${pageDidNotBecomeReady}: its client script has not marked <html> with ${hydratedMark} within ${timeout} ms, so it has not hydrated the page. The page said: ${said.join(" | ") || "nothing"}`,
    { cause },
  );
}

function withWhatThePageSaid(said: string[], cause: unknown): Error {
  return new Error(`${String(cause)} The page said: ${said.join(" | ") || "nothing"}`, { cause });
}

function everyStylesheetLoaded(): boolean {
  const readable = (link: Element) => {
    if (!(link instanceof HTMLLinkElement) || link.sheet === null) return false;
    try {
      return link.sheet.cssRules.length >= 0;
    } catch {
      return false;
    }
  };
  return (
    document.body !== null &&
    [...document.querySelectorAll('link[rel="stylesheet"]')].every(readable)
  );
}

export async function opened(
  page: Page,
  url: string,
  until: OpenedUntil,
  {
    timeout = hydrationTimeout,
    reportsToTheConsole,
  }: { timeout?: number; reportsToTheConsole?: ExpectedReport } = {},
): Promise<void> {
  keepListening(page, reportsToTheConsole);
  if (until === "stylesheetsLoaded") {
    await page.goto(url, { waitUntil: "commit", timeout });
    await page.waitForFunction(everyStylesheetLoaded, undefined, { timeout });
    return;
  }
  if (until !== "hydrated") {
    await page.goto(url, { waitUntil: until });
    return;
  }
  const deadline = Date.now() + timeout;
  const heard = heardFrom(page);
  try {
    await page.goto(url, { waitUntil: "commit", timeout }).catch((cause: unknown) => {
      throw withWhatThePageSaid(heard.said, cause);
    });
    await page
      .waitForFunction((mark) => document.documentElement.hasAttribute(mark), hydratedMark, {
        timeout: Math.max(1, deadline - Date.now()),
      })
      .catch((cause: unknown) => {
        throw notReady(timeout, heard.said, cause);
      });
  } finally {
    heard.stop();
  }
}
