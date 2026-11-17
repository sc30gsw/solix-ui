import { playwright } from "vite-plus/test/browser-playwright";
import type { BrowserInstanceOption } from "vite-plus/test/node";
import { enginesToVerify } from "#/scripts/browser-engines.mjs";

export function browserInEveryEngine() {
  return {
    enabled: true,
    headless: true,
    provider: playwright(),
    screenshotFailures: false,
    get instances() {
      return enginesToVerify().map((engine) => ({
        browser: engine as BrowserInstanceOption["browser"],
      }));
    },
  };
}
