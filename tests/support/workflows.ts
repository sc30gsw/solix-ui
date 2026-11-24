import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
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
type SetUpStep = {
  action: string;
  with: Record<string, unknown>;
  mayAlsoSet?: Record<string, unknown>;
};
const setUpSteps: readonly SetUpStep[] = [
  {
    action: "actions/checkout",
    with: { "fetch-depth": 0 },
    mayAlsoSet: { "persist-credentials": false },
  },
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

function described(step: SetUpStep): string {
  const also = step.mayAlsoSet ? ` and, if it likes, ${JSON.stringify(step.mayAlsoSet)}` : "";
  return `${step.action} with ${JSON.stringify(step.with)}${also}`;
}

type GateJobOptions = {
  checkoutWith?: Record<string, unknown>;
  env?: Record<string, unknown>;
};

function setUpStepsWith(options?: GateJobOptions): readonly SetUpStep[] {
  if (!options?.checkoutWith) return setUpSteps;
  const [checkout, ...rest] = setUpSteps;
  return [{ ...checkout, with: { ...checkout.with, ...options.checkoutWith } }, ...rest];
}

function gateStepsFor(
  command: string,
  steps: readonly SetUpStep[],
  env?: Record<string, unknown>,
): string {
  const withEnv = env ? ` with env ${JSON.stringify(env)}` : "";
  return `${steps.map(described).join(", ")}, then run ${command}${withEnv}, each setting nothing else but a name`;
}

function withMatches(given: Record<string, unknown>, expected: SetUpStep): boolean {
  const allowed = { ...expected.mayAlsoSet, ...expected.with };
  return (
    Object.keys(expected.with).every((key) => key in given) &&
    Object.entries(given).every(
      ([key, value]) => key in allowed && isDeepStrictEqual(value, allowed[key]),
    )
  );
}

function setUpStepProblem(step: Step, expected: SetUpStep): string | undefined {
  const beyond = keysBeyond(step, keysOfASetUpStep);
  if (beyond.length > 0) return `sets ${beyond.join(", ")}`;
  if (step.uses?.split("@")[0]?.toLowerCase() !== expected.action) {
    return `uses ${step.uses ?? "no action"}, not ${expected.action}`;
  }
  return withMatches(step.with ?? {}, expected)
    ? undefined
    : `has with ${JSON.stringify(step.with ?? {})}, not ${JSON.stringify(expected.with)}`;
}

function gateStepProblem(
  step: Step,
  command: string,
  env?: Record<string, unknown>,
): string | undefined {
  const allowed = env ? [...keysOfTheGateStep, "env"] : keysOfTheGateStep;
  const beyond = keysBeyond(step, allowed);
  if (beyond.length > 0) return `sets ${beyond.join(", ")}`;
  const run = typeof step.run === "string" ? step.run.trim() : undefined;
  if (run !== command) return `runs ${run ?? "nothing"}, not ${command}`;
  if (env && !isDeepStrictEqual(step.env, env)) {
    return `has env ${JSON.stringify(step.env ?? {})}, not ${JSON.stringify(env)}`;
  }
  return undefined;
}

function stepProblems(
  name: string,
  steps: readonly Step[],
  command: string,
  options?: GateJobOptions,
): string[] {
  const expectedSetUp = setUpStepsWith(options);
  const exactly = `a gate job's steps are exactly ${gateStepsFor(command, expectedSetUp, options?.env)}.`;
  const wanted = expectedSetUp.length + 1;
  if (steps.length !== wanted) {
    return [`the ${name} job has ${steps.length} steps, not ${wanted}; ${exactly}`];
  }
  return steps.flatMap((step, index) => {
    const expected = expectedSetUp[index];
    const problem =
      expected === undefined
        ? gateStepProblem(step, command, options?.env)
        : setUpStepProblem(step, expected);
    return problem === undefined
      ? []
      : [`step ${index + 1} of the ${name} job ${problem}; ${exactly}`];
  });
}

export function gateJobProblems(
  workflow: Workflow,
  name: string,
  command: string,
  options?: GateJobOptions,
): string[] {
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
    ...stepProblems(name, job.steps ?? [], command, options),
    ...writeScopes(job.permissions ?? workflow.permissions).map(
      (scope) => `the ${name} job is given ${scope}; a gate job only reads.`,
    ),
    ...secretsNamedIn(job).map(
      ({ read }) => `the ${name} job reads ${read}; a gate job reads no secret.`,
    ),
  ];
}
