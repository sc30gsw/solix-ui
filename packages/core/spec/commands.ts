import type { BrowserCommand } from "vite-plus/test/node";

declare module "vite-plus/test/browser" {
  interface BrowserCommands {
    pressOn: (selector: string) => Promise<void>;
    releasePress: () => Promise<void>;
    emulateReducedMotion: (reduce: boolean) => Promise<void>;
  }
}

const pressOn: BrowserCommand<[selector: string]> = async ({ iframe, page }, selector) => {
  await iframe.locator(selector).hover();
  await page.mouse.down();
};

const releasePress: BrowserCommand<[]> = async ({ page }) => {
  await page.mouse.up();
};

const emulateReducedMotion: BrowserCommand<[reduce: boolean]> = async ({ page }, reduce) => {
  await page.emulateMedia({ reducedMotion: reduce ? "reduce" : null });
};

export const specCommands = { pressOn, releasePress, emulateReducedMotion };
