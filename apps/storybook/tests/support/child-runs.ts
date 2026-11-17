import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { installedVp } from "../../../../scripts/repository.ts";
import { isRecord } from "../../../../tests/support/browser-gates.ts";
import { withoutTestRunnerVariables } from "../../../../tests/support/test-runner-environment.ts";
import { type ReportedStory, storyReportVariable } from "#/tests/support/story-reporter.ts";

type ChildRun = { exitCode: number | null; output: string };

type Report = { tests: ReportedStory[] } | { unreadable: string };

const storyReporter = join(import.meta.dirname, "story-reporter.ts");

const telemetrySwitchOutsideTheConfig = "STORYBOOK_DISABLE_TELEMETRY";

function childEnvironment(addedEnvironment: Record<string, string>): NodeJS.ProcessEnv {
  const environment = withoutTestRunnerVariables();
  delete environment[telemetrySwitchOutsideTheConfig];
  return { ...environment, ...addedEnvironment };
}

const groupAlreadyGone = "ESRCH";

function stopGroupProblem(pid: number | undefined): string {
  if (pid === undefined) return "";
  try {
    process.kill(-pid);
    return "";
  } catch (error) {
    return isRecord(error) && error.code === groupAlreadyGone
      ? ""
      : `\nThe run's process group ${pid} could not be stopped: ${String(error)}`;
  }
}

export const childRunMargin = 15_000;

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
      const stopProblem = stopGroupProblem(child.pid);
      finished({
        exitCode: null,
        output: `vp ${args.join(" ")} did not finish within ${timeout} ms and was stopped.${stopProblem} What it printed:\n${printed()}`,
      });
    }, timeout);
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      finished({ exitCode, output: `${printed()}${stopGroupProblem(child.pid)}` });
    });
  });
}

function reportIn(file: string): Report {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    return { unreadable: `the run wrote no report: ${String(error)}` };
  }
  try {
    const { stories } = JSON.parse(text) as { stories: ReportedStory[] };
    return {
      tests: stories.map((story) => ({
        ...story,
        messages: story.messages.map(stripVTControlCharacters),
      })),
    };
  } catch (error) {
    return { unreadable: `the run's report is not JSON: ${String(error)}` };
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
      ["test", "run", ...args, "--reporter=default", `--reporter=${storyReporter}`],
      { ...addedEnvironment, [storyReportVariable]: reportFile },
      timeout,
    );
    return { ...finished, report: reportIn(reportFile) };
  } finally {
    rmSync(reportDirectory, { recursive: true, force: true });
  }
}
