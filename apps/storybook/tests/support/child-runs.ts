import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { installedVp } from "../../../../scripts/repository.ts";
import { withoutTestRunnerVariables } from "../../../../tests/support/test-runner-environment.ts";

type ChildRun = { exitCode: number | null; output: string };

type TestResult = { title: string; status: string; failureMessages: string[] };

type Report = { tests: TestResult[] } | { missing: string };

type JsonReport = { testResults?: { assertionResults?: TestResult[] }[] };

const telemetrySwitchOutsideTheConfig = "STORYBOOK_DISABLE_TELEMETRY";

function childEnvironment(addedEnvironment: Record<string, string>): NodeJS.ProcessEnv {
  const environment = withoutTestRunnerVariables();
  delete environment[telemetrySwitchOutsideTheConfig];
  return { ...environment, ...addedEnvironment };
}

function stopGroup(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    process.kill(-pid);
  } catch {
    return;
  }
}

export function runVp(
  directory: string,
  args: readonly string[],
  addedEnvironment: Record<string, string>,
  timeout: number,
): Promise<ChildRun> {
  const child = spawn(installedVp, args, {
    cwd: directory,
    env: childEnvironment(addedEnvironment),
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const output: string[] = [];
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk: Buffer) => output.push(String(chunk)));
  }
  const printed = () => stripVTControlCharacters(output.join(""));
  return new Promise((finished) => {
    const timer = setTimeout(() => {
      stopGroup(child.pid);
      finished({
        exitCode: null,
        output: `vp ${args.join(" ")} did not finish within ${timeout} ms and was stopped. What it printed:\n${printed()}`,
      });
    }, timeout);
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      stopGroup(child.pid);
      finished({ exitCode, output: printed() });
    });
  });
}

function reportIn(file: string): Report {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    return { missing: `the run wrote no report: ${String(error)}` };
  }
  try {
    const parsed = JSON.parse(text) as JsonReport;
    return {
      tests: (parsed.testResults ?? [])
        .flatMap(({ assertionResults = [] }) => assertionResults)
        .map((test) => ({
          ...test,
          failureMessages: test.failureMessages.map(stripVTControlCharacters),
        })),
    };
  } catch (error) {
    return { missing: `the run's report is not JSON: ${String(error)}` };
  }
}

export async function runVitest(
  directory: string,
  args: readonly string[],
  addedEnvironment: Record<string, string>,
  timeout: number,
): Promise<ChildRun & { report: Report }> {
  const reportDirectory = mkdtempSync(join(tmpdir(), "solix-stories-"));
  const reportFile = join(reportDirectory, "report.json");
  try {
    const finished = await runVp(
      directory,
      ["test", "run", ...args, "--reporter=json", `--outputFile=${reportFile}`],
      addedEnvironment,
      timeout,
    );
    return { ...finished, report: reportIn(reportFile) };
  } finally {
    rmSync(reportDirectory, { recursive: true, force: true });
  }
}
