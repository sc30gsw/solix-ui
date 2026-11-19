import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, inject, test } from "vite-plus/test";
import { repositoryRoot } from "#/tests/support/workspace.ts";

const checkerProject = "rules";
const callOfTheProgramOpener = /\bopenProgram\(/;

function callsTheProgramOpener(file: string): boolean {
  return (
    join(repositoryRoot, file) !== import.meta.filename &&
    callOfTheProgramOpener.test(readFileSync(join(repositoryRoot, file), "utf8"))
  );
}

function refuseAFilteredRun(projects: readonly string[]): void {
  if (!projects.includes(checkerProject) || projects.length < 2) {
    throw new Error(
      `The run holds only the projects ${projects.join(", ")}, so it cannot tell whether the ${checkerProject} project runs before the others. Run it without --project.`,
    );
  }
}

test(`every test file that calls openProgram itself runs in the ${checkerProject} project, whose sequence group comes before that of every other project`, () => {
  const settings = inject("runSettingsOfEachProject");
  const listing = inject("testFilesOfEachProject");
  refuseAFilteredRun(Object.keys(settings));
  const others = Object.entries(settings).filter(([name]) => name !== checkerProject);
  const callersElsewhere = Object.entries(listing).flatMap(([project, files]) =>
    project === checkerProject
      ? []
      : files.filter(callsTheProgramOpener).map((file) => `${project}: ${file}`),
  );

  expect(listing[checkerProject]?.filter(callsTheProgramOpener)).not.toEqual([]);
  expect(callersElsewhere).toEqual([]);
  expect(Math.min(...others.map(([, { groupOrder }]) => groupOrder))).toBeGreaterThan(
    settings[checkerProject].groupOrder,
  );
});
