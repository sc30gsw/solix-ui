import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

export type ServedApp = { directory: string; port: number; command: string[] };

export type RunningServer = { url: string; stop: () => void };

const startupTimeout = 20_000;
const pollInterval = 100;
const bodyShown = 2_000;
const outputShown = 4_000;

export function localUrl(port: number): string {
  return `http://127.0.0.1:${port}/`;
}

type Reply = { ok: boolean; said: string };

async function replyFrom(url: string): Promise<Reply | undefined> {
  try {
    const response = await fetch(url);
    return {
      ok: response.ok,
      said: response.ok ? "" : `${response.status}: ${(await response.text()).slice(0, bodyShown)}`,
    };
  } catch {
    return undefined;
  }
}

export async function startServer({ directory, port, command }: ServedApp): Promise<RunningServer> {
  const url = localUrl(port);
  if (await replyFrom(url)) {
    throw new Error(
      `port ${port} already answers, so this run would test a server it did not start. Stop the process that holds the port.`,
    );
  }
  const [program, ...args] = command;
  const server = spawn(program, args, {
    cwd: directory,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const output: string[] = [];
  for (const stream of [server.stdout, server.stderr]) {
    stream.on("data", (chunk: Buffer) => output.push(String(chunk)));
  }
  const printed = () =>
    `\nWhat the server printed:\n${output.join("").slice(-outputShown) || "nothing"}`;
  const stop = () => {
    if (server.pid !== undefined && server.exitCode === null) process.kill(-server.pid);
  };
  const deadline = Date.now() + startupTimeout;
  for (;;) {
    const reply = await replyFrom(url);
    if (reply?.ok) return { url, stop };
    if (reply) {
      stop();
      throw new Error(
        `${directory}: the server on port ${port} answered ${reply.said}${printed()}`,
      );
    }
    if (Date.now() > deadline) {
      stop();
      throw new Error(
        `${directory}: the server on port ${port} did not answer within ${startupTimeout} ms.${printed()}`,
      );
    }
    await delay(pollInterval);
  }
}
