import type { Page } from "playwright";
import { hydratedMark } from "#/src/hydrated-mark.ts";

export type OpenedUntil = "hydrated" | "commit" | "load";

export const pageDidNotBecomeReady = "the page did not become ready";

export const hydrationTimeout = 10_000;

async function hydrated(page: Page, timeout: number): Promise<void> {
  try {
    await page.waitForFunction(
      (mark) => document.documentElement.hasAttribute(mark),
      hydratedMark,
      { timeout },
    );
  } catch (cause) {
    throw new Error(
      `${pageDidNotBecomeReady}: its client script has not marked <html> with ${hydratedMark} within ${timeout} ms, so it has not hydrated the page.`,
      { cause },
    );
  }
}

export async function opened(
  page: Page,
  url: string,
  until: OpenedUntil,
  { timeout = hydrationTimeout }: { timeout?: number } = {},
): Promise<void> {
  await page.goto(url, { waitUntil: until === "hydrated" ? "networkidle" : until });
  if (until === "hydrated") await hydrated(page, timeout);
}
