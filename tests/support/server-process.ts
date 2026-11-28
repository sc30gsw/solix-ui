import { spawn } from "node:child_process";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { stripVTControlCharacters } from "node:util";

export type ServedApp = {
  directory: string;
  command: string[];
  environment?: Record<string, string>;
};

export type PrintedStream = "stdout" | "stderr";

export type PrintedLine = { readonly stream: PrintedStream; readonly text: string };

export type RunningServer = {
  url: string;
  printedLines: () => readonly PrintedLine[];
  stop: () => Promise<void>;
};

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

async function replyFrom(url: string, deadline: number): Promise<Reply | undefined> {
  const signal = AbortSignal.timeout(Math.max(0, deadline - Date.now()));
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch {
    return undefined;
  }
  try {
    const body = await response.text();
    return {
      ok: response.ok,
      said: response.ok ? "" : `${response.status}: ${body.slice(0, bodyShown)}`,
    };
  } catch (error) {
    return { ok: false, said: `${response.status} but did not finish its page: ${String(error)}` };
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
  const clean = (text: string) => stripVTControlCharacters(text).replace(/\r$/, "");
  const lines: PrintedLine[] = [];
  const unfinished: Record<PrintedStream, string> = { stdout: "", stderr: "" };
  const streams = [
    ["stdout", running.stdout],
    ["stderr", running.stderr],
  ] as const;
  for (const [stream, source] of streams) {
    source.setEncoding("utf8");
    source.on("data", (chunk: string) => {
      const pieces = `${unfinished[stream]}${chunk}`.split("\n");
      unfinished[stream] = pieces.pop() ?? "";
      for (const piece of pieces) {
        const text = clean(piece);
        if (text !== "") lines.push({ stream, text });
      }
    });
  }
  const printedLines = (): PrintedLine[] => {
    const trailing = streams.flatMap(([stream]) => {
      const text = clean(unfinished[stream]);
      return text === "" ? [] : [{ stream, text }];
    });
    return [...lines, ...trailing];
  };
  const printed = () =>
    printedLines()
      .map(({ text }) => text)
      .join("\n");
  const shown = () => `\nWhat the server printed:\n${printed().slice(-outputShown) || "nothing"}`;
  const closed = new Promise<void>((resolve) => running.once("close", () => resolve()));
  const stop = async () => {
    running.stdin.end();
    await closed;
  };
  const failed = async (problem: string): Promise<never> => {
    await stop();
    throw new Error(`${directory}: ${problem}${shown()}`);
  };
  const deadline = Date.now() + startupTimeout;
  for (;;) {
    const port = announcedUrl.exec(printed())?.[1];
    const url = port === undefined ? undefined : localUrl(Number(port));
    const reply = url === undefined ? undefined : await replyFrom(url, deadline);
    if (url !== undefined && reply?.ok) return { url, printedLines, stop };
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
