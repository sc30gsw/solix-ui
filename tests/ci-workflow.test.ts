import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { expect, test } from "vite-plus/test";
import { parse as parseYaml } from "yaml";
import { staticStorybookDirectory } from "#/apps/storybook/tests/support/test-servers.ts";
import { repositoryRoot } from "#/tests/support/workspace.ts";

const ciWorkflow = ".github/workflows/ci.yml";
const verifyCommand = "vp run verify";
const uploadAction = "actions/upload-artifact";
const pullRequestEvent = "pull_request";

type Step = { run?: string; uses?: string; with?: Record<string, unknown> } & Record<
  string,
  unknown
>;
type Workflow = { on?: unknown; jobs?: Record<string, { steps?: Step[] }> };

function ci(): Workflow {
  return parseYaml(readFileSync(join(repositoryRoot, ciWorkflow), "utf8")) as Workflow;
}

function events(on: unknown): string[] {
  if (typeof on === "string") return [on];
  if (Array.isArray(on)) return on.map(String);
  return typeof on === "object" && on !== null ? Object.keys(on) : [];
}

function actionOf(step: Step): string | undefined {
  return step.uses?.split("@")[0];
}

test("on a pull request, the job that runs verify then uploads the Storybook static build that verify made, and fails the step when there is none", () => {
  const { on, jobs = {} } = ci();
  const verifying = Object.entries(jobs).filter(([, { steps = [] }]) =>
    steps.some((step) => step.run?.trim() === verifyCommand),
  );

  expect(events(on), `${ciWorkflow}: run the workflow on ${pullRequestEvent}`).toContain(
    pullRequestEvent,
  );
  expect(
    verifying.map(([name]) => name),
    `${ciWorkflow}: exactly one job runs ${verifyCommand}`,
  ).toHaveLength(1);
  const [name, { steps = [] }] = verifying[0];
  const verifyAt = steps.findIndex((step) => step.run?.trim() === verifyCommand);
  const uploads = steps.flatMap((step, index) =>
    actionOf(step) === uploadAction ? [{ step, index }] : [],
  );

  expect(
    uploads.map(({ index, step }) => ({
      afterVerify: index > verifyAt,
      path: resolve(repositoryRoot, String(step.with?.path)),
      ifNoFilesFound: step.with?.["if-no-files-found"],
      continuesOnError: "continue-on-error" in step,
    })),
    `${ciWorkflow}: the ${name} job uploads ${relative(repositoryRoot, staticStorybookDirectory)}, which verify builds, in one ${uploadAction} step after ${verifyCommand}, with if-no-files-found: error and no continue-on-error`,
  ).toEqual([
    {
      afterVerify: true,
      path: staticStorybookDirectory,
      ifNoFilesFound: "error",
      continuesOnError: false,
    },
  ]);
});
