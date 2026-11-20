import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll } from "vite-plus/test";
import { closed, type Listening, listening, urlOnceListening } from "#/tests/support/listening.ts";

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

export function serveDirectory(root: string): Listening {
  let url: string | undefined;
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

  beforeAll(async () => {
    url = await listening(server);
  });
  afterAll(() => closed(server));

  return {
    get url() {
      return urlOnceListening(url);
    },
  };
}
