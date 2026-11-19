import type { Page } from "playwright";

export type OpenedUntil = "hydrated" | "commit" | "load";

export const pageDidNotBecomeReady = "the page did not become ready";

export const hydrationTimeout = 10_000;

async function hydrated(page: Page, timeout: number): Promise<void> {
  try {
    await page.waitForFunction(
      () => {
        const probes = [...document.querySelectorAll("output[data-hydration-probe]")];
        return probes.length > 0 && probes.every((probe) => probe.hasAttribute("data-hydrated-as"));
      },
      undefined,
      { timeout },
    );
  } catch (cause) {
    throw new Error(
      `${pageDidNotBecomeReady}: its client script has not claimed every hydration probe of the server's markup within ${timeout} ms.`,
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
