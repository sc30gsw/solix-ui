import type { Browser, Locator } from "playwright";
import { afterAll, beforeAll, describe } from "vite-plus/test";
import { browserType, enginesToVerify } from "#/scripts/browser-engines.mjs";
import { type RunningServer, type ServedApp, startServer } from "#/tests/support/server-process.ts";

export function serveApp(app: ServedApp): () => string {
  let running: RunningServer | undefined;

  beforeAll(async () => {
    running = await startServer(app);
  });

  afterAll(async () => {
    await running?.stop();
  });

  return () => {
    if (running === undefined)
      throw new Error("Read the app's URL in a test or a hook, once it serves.");
    return running.url;
  };
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
