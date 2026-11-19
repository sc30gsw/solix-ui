import type { ConsoleMessage, Page } from "playwright";
import { hydratedMark } from "#/src/hydrated-mark.ts";

export type OpenedUntil = "hydrated" | "commit" | "load";

export const pageDidNotBecomeReady = "the page did not become ready";

export const hydrationTimeout = 10_000;

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

export async function opened(
  page: Page,
  url: string,
  until: OpenedUntil,
  { timeout = hydrationTimeout }: { timeout?: number } = {},
): Promise<void> {
  const hydrates = until === "hydrated";
  const deadline = Date.now() + timeout;
  const heard = heardFrom(page);
  try {
    await page.goto(url, hydrates ? { waitUntil: "commit", timeout } : { waitUntil: until });
    if (hydrates) {
      await page.waitForFunction(
        (mark) => document.documentElement.hasAttribute(mark),
        hydratedMark,
        {
          timeout: Math.max(1, deadline - Date.now()),
        },
      );
    }
  } catch (cause) {
    throw hydrates ? notReady(timeout, heard.said, cause) : cause;
  } finally {
    heard.stop();
  }
}
