import { createServer } from "node:http";
import { afterAll, beforeAll } from "vite-plus/test";
import { localUrl } from "../../../../tests/support/server-process.ts";
import { closed, listening } from "#/tests/support/listening.ts";

export const telemetryUrlVariable = "STORYBOOK_TELEMETRY_URL";

export function collectTelemetry(port: number): { url: string; received: () => string[] } {
  const received: string[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => (body += String(chunk)));
    request.on("end", () => {
      received.push(`${request.method} ${request.url} ${body}`);
      response.end();
    });
  });

  beforeAll(() => listening(server, port));
  afterAll(() => closed(server));

  return { url: `${localUrl(port)}event-log`, received: () => [...received] };
}
