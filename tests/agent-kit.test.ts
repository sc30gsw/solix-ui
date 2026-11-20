import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { kitInstalls, sharedSkills } from "#/scripts/agent-kit.ts";
import { approvedSkills } from "#/scripts/package-skills.ts";
import { workspaceFile } from "#/scripts/pnpm-settings.ts";
import { repositoryRoot } from "#/tests/support/workspace.ts";

const manifest = "package.json";
const lintScript = "lint:solid";
const solidReview = ".agents/skills/verify-solid2/SKILL.md";
const reviewChecklist = "Review checklist";
const runBlock = /^## Run it\n\n```bash\n([\s\S]*?)\n```/m;
const kitCommands = ".claude/commands";
const replacedByTheKit = [
  { pack: "solid-js", name: "solid-2.0" },
  { pack: "solid-js", name: "solid-2.0-cheatsheet" },
];
const openPullRequest = ".agents/skills/open-pull-request/SKILL.md";
const reviewStep = /^(## 4\. [\s\S]*?)(?=^## )/m;

function read(path: string): string {
  return readFileSync(join(repositoryRoot, path), "utf8");
}

test(`${workspaceFile} approves neither skill of solid-js's that the kit's solid-2 skill replaces`, () => {
  const replaced = approvedSkills()
    .filter(({ pack, name }) =>
      replacedByTheKit.some((skill) => skill.pack === pack && skill.name === name),
    )
    .map(
      ({ pack, name }) =>
        `${pack} ${name}: the kit's solid-2 skill says what it says. Leave it out of permissions in ${workspaceFile}.`,
    );

  expect(replaced).toEqual([]);
});

test(`step 4 of open-pull-request runs ${solidReview}, which runs the kit's gates as vp run ${lintScript} and walks the kit's review checklist, and no agent has a command of the kit's`, () => {
  const step = reviewStep.exec(read(openPullRequest))?.[1] ?? "";
  const review = existsSync(join(repositoryRoot, solidReview)) ? read(solidReview) : "";
  const lintSolid: unknown = Reflect.get(JSON.parse(read(manifest)).scripts ?? {}, lintScript);
  const kitSkill = `${sharedSkills}/${kitInstalls(repositoryRoot, "skills")[0]}/SKILL.md`;

  expect(step).toContain("Thermos");
  expect(step).toContain(`\`${solidReview}\``);
  expect(runBlock.exec(review)?.[1]?.split("\n")).toContain(`vp run ${lintScript}`);
  expect(lintSolid).toMatch(/^solid2-kit check --dir \. && solid2-kit doctor$/);
  expect(review).toContain(`\`${kitSkill}\``);
  expect(review).toContain(reviewChecklist);
  expect(
    read(kitSkill)
      .split("\n")
      .some((line) => line.startsWith(`## ${reviewChecklist}`)),
  ).toBe(true);
  expect(existsSync(join(repositoryRoot, kitCommands))).toBe(false);
});
