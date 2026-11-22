import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { sharedSkills } from "#/scripts/agent-kit.ts";
import { modelFilePatterns } from "#/scripts/formal-verification.ts";
import { formalSkillPrefix } from "#/scripts/verification-skills.ts";
import { kitSkills } from "#/scripts/package-skills.ts";
import { lineLimit } from "#/scripts/pull-request-text.ts";
import { repositoryRoot } from "#/tests/support/workspace.ts";

const openPullRequest = ".agents/skills/open-pull-request/SKILL.md";
const reviewStep = /^(## 5\. Review[\s\S]*?)(?=^## )/m;
const verificationSkillsStep = /^(## 3\. Verification skills[\s\S]*?)(?=^## )/m;
const surfaceSkillCreator = ".agents/skills/create-verification-skill/SKILL.md";
const rubrics = [
  ".agents/skills/thermo-nuclear-review/SKILL.md",
  ".agents/skills/thermo-nuclear-code-quality-review/SKILL.md",
];
const solidReview = ".agents/skills/review-solid2/SKILL.md";
const reviewChecklist = "## Review checklist";

const steps = [
  "1. Verify",
  "2. Correct",
  "3. Verification skills",
  "4. No comments",
  "5. Review",
  "6. Statechart",
  "7. Open it",
  "8. Reflect",
];
const pointers = [
  "`filesAfterReview` in `scripts/pull-request-text.ts`",
  "`modelFilePatterns` in `scripts/formal-verification.ts`",
  "`reviewLines` in `scripts/pull-request-text.ts`",
  "`pstack/skills/poteto-mode/playbooks/opening-a-pr.md`",
];

const braces = /\{([^{}]*)\}/;

function spellingsOf(pattern: string): string[] {
  const group = braces.exec(pattern);
  if (group === null) return [pattern];
  return group[1].split(",").flatMap((choice) => spellingsOf(pattern.replace(group[0], choice)));
}

function read(path: string): string {
  return readFileSync(join(repositoryRoot, path), "utf8");
}

test("open-pull-request has its eight steps in order, with the verification skills before the review, and points at the rules the checks hold instead of copying them", () => {
  const text = read(openPullRequest);
  const headings = text
    .split("\n")
    .filter((line) => /^## \d/.test(line))
    .map((line) => line.slice(3));

  expect(headings).toEqual(steps);
  expect(text).toContain(`\`${formalSkillPrefix}*\``);
  for (const pointer of pointers) expect(text).toContain(pointer);
  for (const pattern of modelFilePatterns.flatMap((each) => [each, ...spellingsOf(each)]))
    expect(text).not.toContain(pattern.replace("**/", ""));
  expect(text).not.toMatch(new RegExp(`\\b${lineLimit}\\b`));
});

test("the review step of open-pull-request starts each reviewer from its rubric's path, so any agent can run it, and reviews the diff with review-solid2", () => {
  const step = reviewStep.exec(read(openPullRequest))?.[1] ?? "";
  const firstInstruction = /first instruction[^.`]* is to read and follow `([^`]+)`/g;

  expect([...step.matchAll(firstInstruction)].map(([, path]) => path).sort()).toEqual(
    [...rubrics].sort(),
  );
  expect(step).toContain(`\`${solidReview}\``);
});

test("the verification-skills step of open-pull-request makes a skill that drives a UI surface with e2e's create-verification-skill, and keeps pstack's for code with no surface that no formal model covers", () => {
  const step = verificationSkillsStep.exec(read(openPullRequest))?.[1] ?? "";

  expect(step).toContain(`e2e's \`create-verification-skill\` (\`${surfaceSkillCreator}\`)`);
  expect(step).toContain(
    "pstack `create-verification-skill` only for code with no surface that no formal model covers",
  );
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
