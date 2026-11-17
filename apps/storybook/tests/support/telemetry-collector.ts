import { createServer } from "node:http";
import { afterAll, beforeAll } from "vite-plus/test";

export type TelemetryCollector = { url: string; received: () => string[] };

export const telemetryUrlVariable = "STORYBOOK_TELEMETRY_URL";

export function collectTelemetry(port: number): TelemetryCollector {
  const received: string[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => (body += String(chunk)));
    request.on("end", () => {
      received.push(`${request.method} ${request.url} ${body}`);
      response.end();
    });
  });

  beforeAll(async () => {
    await new Promise<void>((listening, failed) => {
      server.once("error", failed);
      server.listen(port, "127.0.0.1", listening);
    });
  });

  afterAll(async () => {
    await new Promise((closed) => server.close(closed));
  });

  return { url: `http://127.0.0.1:${port}/event-log`, received: () => [...received] };
}
