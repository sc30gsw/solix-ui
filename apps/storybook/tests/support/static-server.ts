import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll } from "vite-plus/test";
import { localUrl } from "../../../../tests/support/server-process.ts";
import { closed, listening } from "#/tests/support/listening.ts";

const contentTypes: Readonly<Record<string, string>> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

export function serveDirectory(root: string, port: number): string {
  const server = createServer((request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url ?? "/", "http://host").pathname));
    const file = join(root, path.endsWith("/") ? `${path}index.html` : path);
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "content-type": contentTypes[extname(file)] ?? "application/octet-stream",
    });
    createReadStream(file).pipe(response);
  });

  beforeAll(() => listening(server, port));
  afterAll(() => closed(server));

  return localUrl(port);
}
