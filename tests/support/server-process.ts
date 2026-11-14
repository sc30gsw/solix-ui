import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

export type ServedApp = { directory: string; port: number; command: string[] };

export type RunningServer = { url: string; stop: () => void };

const startupTimeout = 20_000;
const pollInterval = 100;

export function localUrl(port: number): string {
  return `http://127.0.0.1:${port}/`;
}

async function answers(url: string): Promise<boolean> {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

export async function startServer({ directory, port, command }: ServedApp): Promise<RunningServer> {
  const url = localUrl(port);
  if (await answers(url)) {
    throw new Error(
      `port ${port} already answers, so this run would test a server it did not start. Stop the process that holds the port.`,
    );
  }
  const [program, ...args] = command;
  const server = spawn(program, args, {
    cwd: directory,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
    stdio: "ignore",
    detached: true,
  });
  const stop = () => {
    if (server.pid !== undefined && server.exitCode === null) process.kill(-server.pid);
  };
  const deadline = Date.now() + startupTimeout;
  while (!(await answers(url))) {
    if (Date.now() > deadline) {
      stop();
      throw new Error(
        `${directory}: the server on port ${port} did not answer within ${startupTimeout} ms.`,
      );
    }
    await delay(pollInterval);
  }
  return { url, stop };
}
