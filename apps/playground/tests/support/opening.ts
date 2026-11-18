import type { Page } from "playwright";

type LoadState = NonNullable<NonNullable<Parameters<Page["goto"]>[1]>["waitUntil"]>;

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

export async function openedBeforeHydration(
  page: Page,
  url: string,
  waitUntil: LoadState,
): Promise<void> {
  await page.goto(url, { waitUntil });
}
