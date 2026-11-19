import { createServer } from "node:http";
import { afterAll, beforeAll } from "vite-plus/test";
import { closed, listening, urlOnceListening } from "#/tests/support/listening.ts";

export const telemetryUrlVariable = "STORYBOOK_TELEMETRY_URL";

export function collectTelemetry(): { readonly url: string; received: () => string[] } {
  const received: string[] = [];
  let url: string | undefined;
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => (body += String(chunk)));
    request.on("end", () => {
      received.push(`${request.method} ${request.url} ${body}`);
      response.end();
    });
  });

  beforeAll(async () => {
    url = await listening(server);
  });
  afterAll(() => closed(server));

  return {
    get url() {
      return `${urlOnceListening(url)}event-log`;
    },
    received: () => [...received],
  };
}
