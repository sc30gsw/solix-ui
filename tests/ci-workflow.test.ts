import { relative, resolve } from "node:path";
import { expect, test } from "vite-plus/test";
import { staticStorybookDirectory } from "#/apps/storybook/tests/support/test-servers.ts";
import { type Step, workflowAt } from "#/tests/support/workflows.ts";
import { repositoryRoot, workflowFiles } from "#/tests/support/workspace.ts";

const ciWorkflow = ".github/workflows/ci.yml";
const verifyCommand = "vp run verify";
const uploadAction = "actions/upload-artifact";
const pullRequestEvent = "pull_request";
const runsDespiteAFailure = /\b(?:always|failure|cancelled)\s*\(/;
const secretsTheWorkflowsRead = ["SOLIX_PRIVATE_TERMS"];
const expression = /\$\{\{([\s\S]*?)\}\}/g;
const secretsContext = /(?<![\w.])secrets(?:\s*\.\s*(\w+))?/g;

function events(on: unknown): string[] {
  if (typeof on === "string") return [on];
  if (Array.isArray(on)) return on.map(String);
  return typeof on === "object" && on !== null ? Object.keys(on) : [];
}

function actionOf(step: Step): string | undefined {
  return step.uses?.split("@")[0];
}

test("on a pull request, once verify passes, the job that runs it uploads the Storybook static build that verify made, keeps it for a set number of days, and fails the step when there is none", () => {
  const { on, jobs = {} } = workflowAt(ciWorkflow);
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
      keptForDays: Number.isInteger(step.with?.["retention-days"])
        ? Number(step.with?.["retention-days"]) > 0
        : false,
      runsOnlyAfterSuccess: !runsDespiteAFailure.test(JSON.stringify(step.if ?? "")),
      continuesOnError: (step["continue-on-error"] ?? false) !== false,
    })),
    `${ciWorkflow}: the ${name} job uploads ${relative(repositoryRoot, staticStorybookDirectory)}, which verify builds, in one ${uploadAction} step after ${verifyCommand}, with if-no-files-found: error, a whole number of retention-days, an if that calls none of always(), failure() or cancelled(), so it runs only once verify passed, and no continue-on-error`,
  ).toEqual([
    {
      afterVerify: true,
      path: staticStorybookDirectory,
      ifNoFilesFound: "error",
      keptForDays: true,
      runsOnlyAfterSuccess: true,
      continuesOnError: false,
    },
  ]);
});

function writeScopes(permissions: unknown): string[] {
  if (permissions === "read-all") return [];
  if (typeof permissions === "string") return [permissions];
  if (typeof permissions !== "object" || permissions === null || Array.isArray(permissions)) {
    return [String(permissions)];
  }
  return Object.entries(permissions).flatMap(([scope, access]) =>
    access === "read" || access === "none" ? [] : [`${scope}: ${String(access)}`],
  );
}

test("no job of any workflow can push to the repository or write to its pull requests or issues: each job's permissions, its own or its workflow's, are written out and grant nothing but read", () => {
  const violations = workflowFiles.flatMap((file) => {
    const { permissions, jobs = {} } = workflowAt(file);
    return Object.entries(jobs).flatMap(([name, job]) => {
      const given = job.permissions ?? permissions;
      if (given === undefined) {
        return [
          `${file}: the ${name} job takes the repository's default token permissions, which may write. Give the workflow or the job permissions that only read.`,
        ];
      }
      return writeScopes(given).map(
        (scope) =>
          `${file}: the ${name} job is given ${scope}. A check reads; it does not push, comment or label.`,
      );
    });
  });

  expect(workflowFiles.length).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});

function stringsOf(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value !== "object" || value === null) return [];
  return [...Object.keys(value), ...Object.values(value).flatMap(stringsOf)];
}

test(`no workflow reads a secret but ${secretsTheWorkflowsRead.join(", ")}, by name, so no token that could write reaches a job`, () => {
  const violations = workflowFiles.flatMap((file) =>
    stringsOf(workflowAt(file))
      .flatMap((text) => [...text.matchAll(expression)].map(([, inside]) => inside))
      .flatMap((inside) => [...inside.matchAll(secretsContext)])
      .filter(([, name]) => name === undefined || !secretsTheWorkflowsRead.includes(name))
      .map(([read]) => `${file}: it reads ${read}. Give a job no secret that could write.`),
  );

  expect(violations).toEqual([]);
});
