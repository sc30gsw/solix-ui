import { expect } from "vite-plus/test";
import { workflowAt } from "#/tests/support/workflows.ts";

const weeklyWorkflow = ".github/workflows/newest-releases.yml";

type WeeklyTrigger = { schedule?: { cron?: string }[] };

function workflow() {
  return workflowAt<WeeklyTrigger>(weeklyWorkflow);
}

const dayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function valueOf(value: string, names: readonly string[]): number {
  const named = names.indexOf(value.toUpperCase());
  if (named >= 0) return named;
  return /^\d+$/.test(value) ? Number(value) : Number.NaN;
}

function outOfRange(
  field: string,
  low: number,
  high: number,
  names: readonly string[] = [],
): boolean {
  return !field.split(",").every((part) => {
    const [span = "", step, ...rest] = part.split("/");
    if (rest.length > 0 || (step !== undefined && !/^[1-9]\d*$/.test(step))) return false;
    if (span === "*") return true;
    const bounds = span.split("-").map((value) => valueOf(value, names));
    const [first = Number.NaN, last = first] = bounds;
    return (
      bounds.length <= 2 && bounds.every((value) => value >= low && value <= high) && first <= last
    );
  });
}

export function cronProblems(cron: string | undefined): string[] {
  const fields = cron?.trim().split(/\s+/) ?? [];
  if (fields.length !== 5) return [`cron "${cron}": give it five fields.`];
  const [minute = "", hour = "", dayOfMonth = "", month = "", dayOfWeek = ""] = fields;
  const wrong: [string, string, string][] = [
    ["minute", minute, outOfRange(minute, 0, 59) ? "0-59" : ""],
    ["hour", hour, outOfRange(hour, 0, 23) ? "0-23" : ""],
    ["day of month", dayOfMonth, dayOfMonth === "*" ? "" : "*"],
    ["month", month, month === "*" ? "" : "*"],
    ["day of week", dayOfWeek, outOfRange(dayOfWeek, 0, 6, dayNames) ? "0-6 or SUN-SAT" : ""],
  ];
  return wrong
    .filter(([, , allowed]) => allowed !== "")
    .map(
      ([name, value, allowed]) =>
        `cron "${cron}": the ${name} field "${value}" is not ${allowed === "*" ? "*" : `within ${allowed}, with no range reversed`}.`,
    );
}

const refusedBecause: Record<string, string> = {
  if: "so it can be skipped.",
  needs: "so it is skipped when the job it needs fails.",
  "continue-on-error": "so its failure does not fail the run.",
};

export function expectEveryJobToRunWeeklyAndFailTheRun(): void {
  const { on, jobs = {} } = workflow();
  const held = Object.entries(jobs).flatMap(([name, job]) => [
    ...Object.entries(refusedBecause)
      .filter(([key]) => key in job)
      .map(([key, reason]) => `${weeklyWorkflow}: the ${name} job sets ${key}, ${reason}`),
    ...(typeof job["timeout-minutes"] === "number"
      ? []
      : [`${weeklyWorkflow}: give the ${name} job timeout-minutes, so a hung step ends.`]),
  ]);

  expect(Object.keys(jobs).length).toBeGreaterThan(0);
  const schedules = on?.schedule ?? [];
  const weekly = schedules.some(({ cron }) => cronProblems(cron).length === 0);

  expect(
    weekly
      ? []
      : [
          `${weeklyWorkflow}: no schedule entry fires weekly.`,
          ...schedules.flatMap(({ cron }) => cronProblems(cron)),
        ],
  ).toEqual([]);
  expect(held).toEqual([]);
}

export function expectJobToHaveOneStepRunning(jobName: string, command: string): void {
  const steps = (workflow().jobs?.[jobName]?.steps ?? []).filter((step) => step.run === command);

  expect(steps.length).toBe(1);
  expect(steps[0]).not.toHaveProperty("if");
  expect(steps[0]).not.toHaveProperty("continue-on-error");
}
