import { spawn } from "node:child_process";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { stripVTControlCharacters } from "node:util";

export type ServedApp = {
  directory: string;
  command: string[];
  environment?: Record<string, string>;
};

export type RunningServer = { url: string; printed: () => string; stop: () => Promise<void> };

export const localHost = "127.0.0.1";
export const anyFreePort = 0;
export const viteOnAFreePort = ["--host", localHost, "--port", String(anyFreePort), "--strictPort"];

const supervisor = join(import.meta.dirname, "server-supervisor.ts");
const announcedUrl = /http:\/\/127\.0\.0\.1:(\d+)/;
const startupTimeout = 20_000;
const pollInterval = 100;
const bodyShown = 2_000;
const outputShown = 4_000;

export function localUrl(port: number): string {
  return `http://${localHost}:${port}/`;
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

export async function startServer({
  directory,
  command,
  environment,
}: ServedApp): Promise<RunningServer> {
  const running = spawn(process.execPath, [supervisor, ...command], {
    cwd: directory,
    env: { ...process.env, ...environment, PORT: String(anyFreePort), HOST: localHost },
    stdio: ["pipe", "pipe", "pipe"],
    detached: true,
  });
  const output: string[] = [];
  for (const stream of [running.stdout, running.stderr]) {
    stream.on("data", (chunk: Buffer) => output.push(String(chunk)));
  }
  const printed = () => stripVTControlCharacters(output.join(""));
  const shown = () => `\nWhat the server printed:\n${printed().slice(-outputShown) || "nothing"}`;
  const exited = new Promise<void>((resolve) => running.once("exit", () => resolve()));
  const stop = async () => {
    running.stdin.end();
    await exited;
  };
  const failed = async (problem: string): Promise<never> => {
    await stop();
    throw new Error(`${directory}: ${problem}${shown()}`);
  };
  const deadline = Date.now() + startupTimeout;
  for (;;) {
    const port = announcedUrl.exec(printed())?.[1];
    const url = port === undefined ? undefined : localUrl(Number(port));
    const reply = url === undefined ? undefined : await replyFrom(url);
    if (url !== undefined && reply?.ok) return { url, printed, stop };
    if (reply) return failed(`the server at ${url} answered ${reply.said}`);
    if (running.exitCode !== null || running.signalCode !== null)
      return failed("the server exited before it answered.");
    if (Date.now() > deadline)
      return failed(
        url === undefined
          ? `the server printed no ${localHost} address within ${startupTimeout} ms.`
          : `the server at ${url} did not answer within ${startupTimeout} ms.`,
      );
    await delay(pollInterval);
  }
}
