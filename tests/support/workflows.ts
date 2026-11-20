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

export const newestReleasesCheck = "node scripts/check-newest-releases.ts";

const keysOfAWorkflowWithAGate = ["name", "on", "permissions", "jobs"];
const keysOfAGateJob = ["runs-on", "timeout-minutes", "steps", "permissions"];
const keysOfAGateStep = ["uses", "with", "run", "name"];
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

export function gateJobProblems(workflow: Workflow, name: string, command: string): string[] {
  const job = workflow.jobs?.[name];
  if (job === undefined) return [`the workflow has no ${name} job.`];
  const steps = job.steps ?? [];
  const running = steps.filter((step) => step.run?.trim() === command);
  return [
    ...keysBeyond(workflow, keysOfAWorkflowWithAGate).map(
      (key) => `the workflow sets ${key}, which reaches the ${name} job.`,
    ),
    ...keysBeyond(job, keysOfAGateJob).map(
      (key) => `the ${name} job sets ${key}; a gate job sets only ${keysOfAGateJob.join(", ")}.`,
    ),
    ...(typeof job["timeout-minutes"] === "number"
      ? []
      : [`give the ${name} job timeout-minutes, so a hung step ends.`]),
    ...steps.flatMap((step, index) =>
      keysBeyond(step, keysOfAGateStep).map(
        (key) =>
          `step ${index + 1} of the ${name} job sets ${key}; a gate step sets only ${keysOfAGateStep.join(", ")}.`,
      ),
    ),
    ...(running.length === 1
      ? []
      : [`the ${name} job runs ${command} in ${running.length} steps, not in exactly one.`]),
    ...writeScopes(job.permissions ?? workflow.permissions).map(
      (scope) => `the ${name} job is given ${scope}; a gate job only reads.`,
    ),
    ...secretsNamedIn(job).map(
      ({ read }) => `the ${name} job reads ${read}; a gate job reads no secret.`,
    ),
  ];
}
