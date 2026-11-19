import { expect, test } from "vite-plus/test";
import { startServer } from "#/tests/support/server-process.ts";
import { inTemporaryTree } from "#/tests/support/temporary-tree.ts";

const ignoresSigterm = [
  'process.on("SIGTERM", () => undefined);',
  "setTimeout(() => process.exit(0), 30_000);",
  'require("node:http").createServer((_, response) => response.end("ok"))',
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
