import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vite-plus/test";
import { parse as parseYaml } from "yaml";
import { repositoryRoot } from "#/scripts/repository.ts";

const weeklyWorkflow = ".github/workflows/newest-releases.yml";

type Job = Record<string, unknown> & { steps?: Record<string, unknown>[] };

type Workflow = {
  on?: { schedule?: { cron?: string }[] };
  jobs?: Record<string, Job>;
};

function workflow(): Workflow {
  return parseYaml(readFileSync(join(repositoryRoot, weeklyWorkflow), "utf8")) as Workflow;
}

const dayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function valueOf(value: string, names: readonly string[]): number {
  const named = names.indexOf(value.toUpperCase());
  if (named >= 0) return named;
  return /^\d+$/.test(value) ? Number(value) : Number.NaN;
}

function inRange(field: string, low: number, high: number, names: readonly string[] = []): boolean {
  return field.split(",").every((part) => {
    const [span = "", step, ...rest] = part.split("/");
    if (rest.length > 0 || (step !== undefined && !/^[1-9]\d*$/.test(step))) return false;
    if (span === "*") return true;
    const bounds = span.split("-").map((value) => valueOf(value, names));
    return bounds.length <= 2 && bounds.every((value) => value >= low && value <= high);
  });
}

function firesWeekly(cron: string | undefined): boolean {
  const fields = cron?.trim().split(/\s+/) ?? [];
  const [minute = "", hour = "", dayOfMonth, month, dayOfWeek = ""] = fields;
  return (
    fields.length === 5 &&
    dayOfMonth === "*" &&
    month === "*" &&
    inRange(minute, 0, 59) &&
    inRange(hour, 0, 23) &&
    inRange(dayOfWeek, 0, 6, dayNames)
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
  expect((on?.schedule ?? []).some(({ cron }) => firesWeekly(cron))).toBe(true);
  expect(held).toEqual([]);
}

export function expectJobToHaveOneStepRunning(jobName: string, command: string): void {
  const steps = (workflow().jobs?.[jobName]?.steps ?? []).filter((step) => step.run === command);

  expect(steps.length).toBe(1);
  expect(steps[0]).not.toHaveProperty("if");
  expect(steps[0]).not.toHaveProperty("continue-on-error");
}
