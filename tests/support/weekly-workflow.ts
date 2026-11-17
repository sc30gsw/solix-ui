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

function firesWeekly(cron: string | undefined): boolean {
  const [, , dayOfMonth, month, dayOfWeek] = cron?.trim().split(/\s+/) ?? [];
  return dayOfMonth === "*" && month === "*" && dayOfWeek !== undefined;
}

export function expectEveryJobToRunOnASchedule(): void {
  const { on, jobs = {} } = workflow();
  const held = Object.entries(jobs).flatMap(([name, job]) => [
    ...["if", "needs", "continue-on-error"]
      .filter((key) => key in job)
      .map(
        (key) => `${weeklyWorkflow}: the ${name} job sets ${key}, so it does not run every week.`,
      ),
    ...(typeof job["timeout-minutes"] === "number"
      ? []
      : [`${weeklyWorkflow}: give the ${name} job timeout-minutes, so a hung step ends.`]),
  ]);

  expect(Object.keys(jobs).length).toBeGreaterThan(0);
  expect((on?.schedule ?? []).some(({ cron }) => firesWeekly(cron))).toBe(true);
  expect(held).toEqual([]);
}

export function expectScheduledJobToRun(jobName: string, command: string): void {
  const steps = (workflow().jobs?.[jobName]?.steps ?? []).filter((step) => step.run === command);

  expect(steps.length).toBe(1);
  expect(steps[0]).not.toHaveProperty("if");
  expect(steps[0]).not.toHaveProperty("continue-on-error");
}
