import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { repositoryRoot } from "#/scripts/repository.ts";

export type Step = { run?: string; uses?: string; with?: Record<string, unknown> } & Record<
  string,
  unknown
>;

export type Job = { permissions?: unknown; secrets?: unknown; steps?: Step[] } & Record<
  string,
  unknown
>;

export type Workflow<On = unknown> = {
  on?: On;
  permissions?: unknown;
  jobs?: Record<string, Job>;
};

export function workflowAt<On = unknown>(file: string): Workflow<On> {
  return parseYaml(readFileSync(join(repositoryRoot, file), "utf8")) as Workflow<On>;
}

const keysOfAGateWorkflow = ["name", "on", "permissions", "jobs"];
const keysOfAGateJob = ["runs-on", "timeout-minutes", "steps", "permissions"];
const keysOfASetUpStep = ["uses", "with", "name"];
const keysOfTheGateStep = ["run", "name"];
const setUpSteps: readonly { action: string; with: Record<string, unknown> }[] = [
  { action: "actions/checkout", with: { "fetch-depth": 0 } },
  {
    action: "voidzero-dev/setup-vp",
    with: { "node-version-file": "package.json", cache: true },
  },
];
const expression = /\$\{\{([\s\S]*?)\}\}/g;
const secretsContext = /(?<![\w.])secrets(?:\s*\.\s*(\w+))?/g;

export const permissionsLeftOut = "no permissions written out";

export function writeScopes(permissions: unknown): string[] {
  if (permissions === undefined) return [permissionsLeftOut];
  if (permissions === "read-all") return [];
  if (typeof permissions === "string") return [permissions];
  if (typeof permissions !== "object" || permissions === null || Array.isArray(permissions)) {
    return [JSON.stringify(permissions)];
  }
  return Object.entries(permissions).flatMap(([scope, access]) =>
    access === "read" || access === "none" ? [] : [`${scope}: ${String(access)}`],
  );
}

export function stringsOf(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value !== "object" || value === null) return [];
  return [...Object.keys(value), ...Object.values(value).flatMap(stringsOf)];
}

export function secretsNamedIn(value: unknown): { read: string; name: string | undefined }[] {
  return stringsOf(value)
    .flatMap((text) => [...text.matchAll(expression)].map(([, inside]) => inside))
    .flatMap((inside) => [...inside.matchAll(secretsContext)])
    .map(([read, name]) => ({ read, name }));
}

function keysBeyond(part: object, allowed: readonly string[]): string[] {
  return Object.keys(part).filter((key) => !allowed.includes(key));
}

function isDeepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function gateStepsFor(command: string): string {
  return `${setUpSteps.map((step) => `${step.action} with ${JSON.stringify(step.with)}`).join(", ")}, then run ${command}, each setting nothing else but a name`;
}

function setUpStepProblem(step: Step, expected: (typeof setUpSteps)[number]): string | undefined {
  const beyond = keysBeyond(step, keysOfASetUpStep);
  if (beyond.length > 0) return `sets ${beyond.join(", ")}`;
  if (step.uses?.split("@")[0] !== expected.action) {
    return `uses ${step.uses ?? "no action"}, not ${expected.action}`;
  }
  return isDeepEqual(step.with ?? {}, expected.with)
    ? undefined
    : `has with ${JSON.stringify(step.with ?? {})}, not ${JSON.stringify(expected.with)}`;
}

function gateStepProblem(step: Step, command: string): string | undefined {
  const beyond = keysBeyond(step, keysOfTheGateStep);
  if (beyond.length > 0) return `sets ${beyond.join(", ")}`;
  const run = typeof step.run === "string" ? step.run.trim() : undefined;
  return run === command ? undefined : `runs ${run ?? "nothing"}, not ${command}`;
}

function stepProblems(name: string, steps: readonly Step[], command: string): string[] {
  const exactly = `a gate job's steps are exactly ${gateStepsFor(command)}.`;
  const wanted = setUpSteps.length + 1;
  if (steps.length !== wanted) {
    return [`the ${name} job has ${steps.length} steps, not ${wanted}; ${exactly}`];
  }
  return steps.flatMap((step, index) => {
    const expected = setUpSteps[index];
    const problem =
      expected === undefined ? gateStepProblem(step, command) : setUpStepProblem(step, expected);
    return problem === undefined
      ? []
      : [`step ${index + 1} of the ${name} job ${problem}; ${exactly}`];
  });
}

export function gateJobProblems(workflow: Workflow, name: string, command: string): string[] {
  const job = workflow.jobs?.[name];
  if (job === undefined) return [`the workflow has no ${name} job.`];
  return [
    ...keysBeyond(workflow, keysOfAGateWorkflow).map(
      (key) =>
        `the workflow of the ${name} job sets ${key}; a gate job's workflow sets only ${keysOfAGateWorkflow.join(", ")}.`,
    ),
    ...keysBeyond(job, keysOfAGateJob).map(
      (key) => `the ${name} job sets ${key}; a gate job sets only ${keysOfAGateJob.join(", ")}.`,
    ),
    ...(typeof job["timeout-minutes"] === "number"
      ? []
      : [`give the ${name} job timeout-minutes, so a hung step ends.`]),
    ...stepProblems(name, job.steps ?? [], command),
    ...writeScopes(job.permissions ?? workflow.permissions).map(
      (scope) => `the ${name} job is given ${scope}; a gate job only reads.`,
    ),
    ...secretsNamedIn(job).map(
      ({ read }) => `the ${name} job reads ${read}; a gate job reads no secret.`,
    ),
  ];
}
