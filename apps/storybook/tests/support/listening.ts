import type { Server } from "node:http";
import { anyFreePort, localHost, localUrl } from "../../../../tests/support/server-process.ts";

export type Listening = { readonly url: string };

export function listening(server: Server): Promise<string> {
  return new Promise((listened, failed) => {
    server.once("error", failed);
    server.listen(anyFreePort, localHost, () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        failed(new Error(`the server listens on ${String(address)}, not on a port.`));
        return;
      }
      listened(localUrl(address.port));
    });
  });
}

export function closed(server: Server): Promise<void> {
  return new Promise((done) => server.close(() => done()));
}

export function urlOnceListening(url: string | undefined): string {
  if (url === undefined)
    throw new Error("Read the server's URL in a test or a hook, once it listens.");
  return url;
}
