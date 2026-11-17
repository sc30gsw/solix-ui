import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

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

export type StaticServer = { url: string; close: () => Promise<void> };

export async function serveDirectory(root: string, port: number): Promise<StaticServer> {
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
  await new Promise<void>((listening, failed) => {
    server.once("error", failed);
    server.listen(port, "127.0.0.1", listening);
  });
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise((closed) => server.close(() => closed())),
  };
}
