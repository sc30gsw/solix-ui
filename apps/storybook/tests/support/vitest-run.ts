import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installedVp } from "../../../../scripts/repository.ts";

export type Finished = { exitCode: number | null; output: string };

export type TestResult = { title: string; status: string; failureMessages: string[] };

export type VitestRun = Finished & { tests: TestResult[] };

type JsonReport = { testResults: { assertionResults: TestResult[] }[] };

const variablesOfTheOuterRun = /^(VITEST|VITE_|TEST$|MODE$|NODE_ENV$)/;
const colourCode = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

export function withoutColour(text: string): string {
  return text.replace(colourCode, "");
}

export function runVp(
  directory: string,
  args: readonly string[],
  added: Record<string, string>,
): Promise<Finished> {
  const child = spawn(installedVp, args, {
    cwd: directory,
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(([name]) => !variablesOfTheOuterRun.test(name)),
      ),
      ...added,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output: string[] = [];
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk: Buffer) => output.push(String(chunk)));
  }
  return new Promise((finished) =>
    child.on("close", (exitCode) => finished({ exitCode, output: withoutColour(output.join("")) })),
  );
}

function reportedTests(report: string): TestResult[] {
  try {
    const parsed = JSON.parse(readFileSync(report, "utf8")) as JsonReport;
    return parsed.testResults
      .flatMap(({ assertionResults }) => assertionResults)
      .map((test) => ({ ...test, failureMessages: test.failureMessages.map(withoutColour) }));
  } catch {
    return [];
  }
}

export async function runVitest(
  directory: string,
  args: readonly string[],
  added: Record<string, string>,
): Promise<VitestRun> {
  const reportDirectory = mkdtempSync(join(tmpdir(), "solix-stories-"));
  const report = join(reportDirectory, "report.json");
  try {
    const finished = await runVp(
      directory,
      ["test", "run", ...args, "--reporter=json", `--outputFile=${report}`],
      added,
    );
    return { ...finished, tests: reportedTests(report) };
  } finally {
    rmSync(reportDirectory, { recursive: true, force: true });
  }
}
