import type { Server } from "node:http";

export function listening(server: Server, port: number): Promise<void> {
  return new Promise((listened, failed) => {
    server.once("error", failed);
    server.listen(port, "127.0.0.1", listened);
  });
}

export function closed(server: Server): Promise<void> {
  return new Promise((done) => server.close(() => done()));
}
