import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { sharedSkills } from "#/scripts/agent-kit.ts";
import { formalSkillPrefix, modelFilePatterns } from "#/scripts/formal-verification.ts";
import { kitSkills } from "#/scripts/package-skills.ts";
import { repositoryRoot } from "#/tests/support/workspace.ts";

const openPullRequest = ".agents/skills/open-pull-request/SKILL.md";
const reviewStep = /^(## 4\. [\s\S]*?)(?=^## )/m;
const rubrics = [
  ".agents/skills/thermo-nuclear-review/SKILL.md",
  ".agents/skills/thermo-nuclear-code-quality-review/SKILL.md",
];
const solidReview = ".agents/skills/review-solid2/SKILL.md";
const reviewChecklist = "## Review checklist";

const steps = [
  "1. Verify",
  "2. Correct",
  "3. No comments",
  "4. Review",
  "5. Verification skills",
  "6. Statechart",
  "7. Open it",
  "8. Reflect",
];

function read(path: string): string {
  return readFileSync(join(repositoryRoot, path), "utf8");
}

test("open-pull-request has its eight steps in order, names the formal-verification prefix, and the model files the pull request check asks a chart for", () => {
  const text = read(openPullRequest);
  const headings = text
    .split("\n")
    .filter((line) => /^## \d/.test(line))
    .map((line) => line.slice(3));

  expect(headings).toEqual(steps);
  expect(text).toContain(`\`${formalSkillPrefix}*\``);
  for (const pattern of modelFilePatterns)
    expect(text).toContain(`\`${pattern.replace("**/", "")}\``);
});

test("step 4 of open-pull-request starts each reviewer from its rubric's path, so any agent can run it, and reviews the diff with review-solid2", () => {
  const step = reviewStep.exec(read(openPullRequest))?.[1] ?? "";
  const firstInstruction = /first instruction[^.`]* is to read and follow `([^`]+)`/g;

  expect([...step.matchAll(firstInstruction)].map(([, path]) => path).sort()).toEqual(
    [...rubrics].sort(),
  );
  expect(step).toContain(`\`${solidReview}\``);
});

test("review-solid2 reviews the diff against the review checklist of the kit's solid-2 skill, which has one", () => {
  const named = kitSkills
    .map((name) => `${sharedSkills}/${name}/SKILL.md`)
    .filter((path) => read(solidReview).includes(`\`${path}\``));

  expect(named.length).toBe(1);
  expect(
    read(named[0] ?? "")
      .split("\n")
      .some((line) => line.startsWith(reviewChecklist)),
  ).toBe(true);
});
