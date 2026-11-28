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
  'require("node:http").createServer((request, response) => { process.stdout.write("\\u001b[33mserved "); process.stderr.write("warned for "); setTimeout(() => { process.stdout.write(`${request.url}\\u001b[39m\\n`); process.stderr.write(`${request.url} ✓\\n`); response.end("ok"); }, 50); })',
  '.listen(0, "127.0.0.1", function () { console.log(`Listening on http://127.0.0.1:${this.address().port}`); });',
].join("\n");
const streamsItsPageLate = [
  "let unfinished = 0;",
  'require("node:http").createServer((request, response) => { if (request.url === "/unfinished") { response.end(String(unfinished)); return; } unfinished += 1; response.write("<p>shell "); setTimeout(() => { unfinished -= 1; response.end("streamed</p>"); }, 500); })',
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

test("a running server gives each line it has printed so far with the stream it went to, without colour codes, whole when another stream wrote between its pieces, including what it printed after it started", async () => {
  await inTemporaryTree({}, async (directory) => {
    const server = await startServer({
      directory,
      command: [process.execPath, "-e", printsEachRequest],
    });

    try {
      expect(await answers(`${server.url}after-start`)).toBe(true);
      await expect
        .poll(() => server.printedLines())
        .toContainEqual({ stream: "stderr", text: "warned for /after-start ✓" });
      expect(server.printedLines()).toContainEqual({
        stream: "stdout",
        text: "served /after-start",
      });
      expect(server.printedLines().map(({ text }) => text)).toContainEqual(
        expect.stringContaining("Listening on http://127.0.0.1:"),
      );
    } finally {
      await server.stop();
    }
  });
});

test("a server counts as started only once the page that checked it has been read to its end, so no response the check began is left for the garbage collector to cancel mid-stream", async () => {
  await inTemporaryTree({}, async (directory) => {
    const server = await startServer({
      directory,
      command: [process.execPath, "-e", streamsItsPageLate],
    });

    try {
      expect(await (await fetch(`${server.url}unfinished`)).text()).toBe("0");
    } finally {
      await server.stop();
    }
  });
});
