import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parse as parseYaml } from "yaml";
import { pnpmSettings } from "#/scripts/pnpm-settings.ts";
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
type ExtraCheckedKey = { key: string; rule: string };
type SetUpStep = {
  action: string;
  with: Record<string, unknown>;
  mayAlsoSet?: Record<string, unknown>;
  extraKeysChecked?: readonly ExtraCheckedKey[];
};
const setUpVpAction = "voidzero-dev/setup-vp";
const setUpSteps: readonly SetUpStep[] = [
  {
    action: "actions/checkout",
    with: { "fetch-depth": 0 },
    mayAlsoSet: { "persist-credentials": false },
  },
  {
    action: setUpVpAction,
    with: { "node-version-file": "package.json", cache: true },
    extraKeysChecked: [{ key: "version", rule: "the vite-plus version rule" }],
  },
];

export function catalogVitePlus(): string {
  const pinned = pnpmSettings().catalog["vite-plus"];
  if (pinned === undefined) throw new Error("The catalog pins no vite-plus; pin the release.");
  return pinned;
}

export function actionOf(step: Step): string | undefined {
  return step.uses?.split("@")[0]?.toLowerCase();
}

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

function describedStep(step: SetUpStep): string {
  const also = step.mayAlsoSet ? ` and, if it likes, ${JSON.stringify(step.mayAlsoSet)}` : "";
  const extra = (step.extraKeysChecked ?? [])
    .map(({ key, rule }) => ` and the ${key} ${rule} asks for`)
    .join("");
  return `${step.action} with ${JSON.stringify(step.with)}${also}${extra}`;
}

function gateStepsFor(command: string): string {
  const described = setUpSteps.map(describedStep);
  return `${described.join(", ")}, then run ${command}, each setting nothing else but a name`;
}

function withoutExtraCheckedKeys(
  given: Record<string, unknown>,
  expected: SetUpStep,
): Record<string, unknown> {
  const extra = new Set((expected.extraKeysChecked ?? []).map(({ key }) => key));
  return Object.fromEntries(Object.entries(given).filter(([key]) => !extra.has(key)));
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
  if (actionOf(step) !== expected.action) {
    return `uses ${step.uses ?? "no action"}, not ${expected.action}`;
  }
  const checked = withoutExtraCheckedKeys(step.with ?? {}, expected);
  return withMatches(checked, expected)
    ? undefined
    : `has with ${JSON.stringify(checked)}, not ${JSON.stringify(expected.with)}`;
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

export function vitePlusVersionProblems(workflow: Workflow): string[] {
  const pinned = catalogVitePlus();
  return Object.entries(workflow.jobs ?? {}).flatMap(([name, { steps = [] }]) =>
    steps.flatMap((step, index) => {
      if (actionOf(step) !== setUpVpAction) return [];
      const version = step.with?.version;
      if (isDeepStrictEqual(version, pinned)) return [];
      const given = version === undefined ? "no version" : `version ${JSON.stringify(version)}`;
      return [
        `step ${index + 1} of the ${name} job sets up Vite+ with ${given}; give it version ${JSON.stringify(pinned)}, the vite-plus release the catalog pins.`,
      ];
    }),
  );
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
    ...vitePlusVersionProblems({ jobs: { [name]: job } }),
    ...writeScopes(job.permissions ?? workflow.permissions).map(
      (scope) => `the ${name} job is given ${scope}; a gate job only reads.`,
    ),
    ...secretsNamedIn(job).map(
      ({ read }) => `the ${name} job reads ${read}; a gate job reads no secret.`,
    ),
  ];
}
