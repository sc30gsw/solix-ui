import type { Browser, Locator } from "playwright";
import { afterAll, beforeAll, describe } from "vite-plus/test";
import { browserType, enginesToVerify } from "../../scripts/browser-engines.mjs";
import { localUrl, type RunningServer, type ServedApp, startServer } from "./server-process";

export function serveApp(app: ServedApp): string {
  let running: RunningServer | undefined;

  beforeAll(async () => {
    running = await startServer(app);
  });

  afterAll(() => {
    running?.stop();
  });

  return localUrl(app.port);
}

export function inEveryEngine(define: (browser: () => Browser) => void): void {
  describe.each(enginesToVerify())("in %s", (engine) => {
    let browser: Browser;

    beforeAll(async () => {
      browser = await browserType(engine).launch();
    });

    afterAll(async () => {
      await browser.close();
    });

    define(() => browser);
  });
}

export function computed(element: Locator, property: string): Promise<string> {
  return element.evaluate((node, name) => getComputedStyle(node).getPropertyValue(name), property);
}
