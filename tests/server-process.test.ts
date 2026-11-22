import { expect, test } from "vite-plus/test";
import { startServer } from "#/tests/support/server-process.ts";
import { inTemporaryTree } from "#/tests/support/temporary-tree.ts";

const ignoresSigterm = [
  'process.on("SIGTERM", () => undefined);',
  "setTimeout(() => process.exit(0), 30_000);",
  'require("node:http").createServer((_, response) => response.end("ok"))',
  '.listen(0, "127.0.0.1", function () { console.log(`Listening on http://127.0.0.1:${this.address().port}`); });',
].join("\n");
const printsEachRequest = [
  'require("node:http").createServer((request, response) => { console.log(`\\u001b[33mserved ${request.url}\\u001b[39m`); response.end("ok"); })',
  '.listen(0, "127.0.0.1", function () { console.log(`Listening on http://127.0.0.1:${this.address().port}`); });',
].join("\n");
const gracePeriodAndMargin = 10_000;

async function answers(url: string): Promise<boolean> {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

test(
  "stopping a server that ignores SIGTERM kills it once the grace period is over",
  async () => {
    await inTemporaryTree({}, async (directory) => {
      const server = await startServer({
        directory,
        command: [process.execPath, "-e", ignoresSigterm],
      });

      expect(await answers(server.url)).toBe(true);
      await server.stop();
      await expect
        .poll(() => answers(server.url), { timeout: gracePeriodAndMargin, interval: 200 })
        .toBe(false);
    });
  },
  gracePeriodAndMargin * 3,
);

test("a running server gives everything it has printed so far, without colour codes, including what it printed after it started", async () => {
  await inTemporaryTree({}, async (directory) => {
    const server = await startServer({
      directory,
      command: [process.execPath, "-e", printsEachRequest],
    });

    try {
      expect(await answers(`${server.url}after-start`)).toBe(true);
      await expect.poll(() => server.printed()).toContain("served /after-start");
      expect(server.printed()).toContain("Listening on http://127.0.0.1:");
      expect(server.printed()).not.toContain("\u001b[");
    } finally {
      await server.stop();
    }
  });
});
