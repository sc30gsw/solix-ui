import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vite-plus/test";
import { parse as parseYaml } from "yaml";
import { repositoryRoot } from "#/scripts/repository.ts";

export const weeklyWorkflow = ".github/workflows/newest-releases.yml";

type Workflow = {
  on?: { schedule?: unknown[] };
  jobs?: Record<string, Record<string, unknown> & { steps?: Record<string, unknown>[] }>;
};

export function expectScheduledJobToRun(jobName: string, command: string): void {
  const workflow = parseYaml(
    readFileSync(join(repositoryRoot, weeklyWorkflow), "utf8"),
  ) as Workflow;
  const job = workflow.jobs?.[jobName];
  const steps = (job?.steps ?? []).filter((step) => step.run === command);

  expect(workflow.on?.schedule?.length).toBeGreaterThan(0);
  expect(job).toBeDefined();
  expect(job).not.toHaveProperty("if");
  expect(job).not.toHaveProperty("continue-on-error");
  expect(typeof job?.["timeout-minutes"]).toBe("number");
  expect(steps.length).toBe(1);
  expect(steps[0]).not.toHaveProperty("if");
  expect(steps[0]).not.toHaveProperty("continue-on-error");
}
