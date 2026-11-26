import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { expect, test } from "vite-plus/test";
import { inTemporaryTree } from "#/tests/support/temporary-tree.ts";
import { withoutTestRunnerVariables } from "#/tests/support/test-runner-environment.ts";
import { installedVp, repositoryRoot } from "#/scripts/repository.ts";

const probeConfig = join(repositoryRoot, "tests/fixtures/concurrent-runs/vite.config.ts");
const runTimeout = 120_000;
const serverGoneTimeout = 15_000;

type Probe = { url: string; ok: boolean };

type Run = { pid: number | undefined; printed: () => string; finished: Promise<number | null> };

function startRun(report: string, holds: boolean): Run {
  const run = spawn(installedVp, ["test", "--config", probeConfig], {
    cwd: repositoryRoot,
    env: {
      ...withoutTestRunnerVariables(),
      PROBE_REPORT: report,
      PROBE_HOLDS: holds ? "yes" : "no",
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const output: string[] = [];
  for (const stream of [run.stdout, run.stderr]) {
    stream.on("data", (chunk: Buffer) => output.push(String(chunk)));
  }
  return {
    pid: run.pid,
    printed: () => stripVTControlCharacters(output.join("")),
    finished: new Promise((resolve) => run.once("exit", (code) => resolve(code))),
  };
}

function probeIn(report: string): Probe {
  return JSON.parse(readFileSync(report, "utf8")) as Probe;
}

async function answers(url: string): Promise<boolean> {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

test(
  "two test runs started at once each serve the playground on a port of their own and pass",
  async () => {
    await inTemporaryTree({}, async (directory) => {
      const reports = ["first.json", "second.json"].map((name) => join(directory, name));
      const runs = reports.map((report) => startRun(report, false));
      const codes = await Promise.all(runs.map(({ finished }) => finished));

      expect(codes, runs.map(({ printed }) => printed()).join("\n")).toEqual([0, 0]);
      const probes = reports.map(probeIn);
      expect(probes.map(({ ok }) => ok)).toEqual([true, true]);
      expect(new Set(probes.map(({ url }) => url)).size).toBe(2);
    });
  },
  runTimeout * 2,
);

test(
  "a test run killed outright takes its playground server with it",
  async () => {
    await inTemporaryTree({}, async (directory) => {
      const report = join(directory, "held.json");
      const run = startRun(report, true);
      await expect
        .poll(() => existsSync(report), { timeout: runTimeout, interval: 200 })
        .toBe(true);
      const { url, ok } = probeIn(report);
      expect(ok, run.printed()).toBe(true);

      process.kill(-Number(run.pid), "SIGKILL");
      await run.finished;

      await expect
        .poll(() => answers(url), { timeout: serverGoneTimeout, interval: 200 })
        .toBe(false);
    });
  },
  runTimeout + serverGoneTimeout,
);
