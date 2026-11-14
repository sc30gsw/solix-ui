import { type ChildProcess, spawn } from "node:child_process";
import type { Browser, Locator } from "playwright";
import { afterAll, beforeAll, describe, vi } from "vite-plus/test";
import { browserType, enginesToVerify } from "../../scripts/browser-engines.mjs";

type ServedApp = { directory: string; port: number; command: string[] };

async function answers(url: string): Promise<boolean> {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

export function serveApp({ directory, port, command }: ServedApp): string {
  const url = `http://127.0.0.1:${port}/`;
  const [program, ...args] = command;
  let server: ChildProcess | undefined;

  beforeAll(async () => {
    if (await answers(url)) {
      throw new Error(
        `port ${port} already answers, so this run would test a server it did not start. Stop the process that holds the port.`,
      );
    }
    server = spawn(program, args, {
      cwd: directory,
      env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
      stdio: "ignore",
      detached: true,
    });
    await vi.waitUntil(() => answers(url), { timeout: 20_000 });
  });

  afterAll(() => {
    if (server?.pid !== undefined) process.kill(-server.pid);
  });

  return url;
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
