import { expect, inject, test } from "vite-plus/test";
import { packagesBuiltFirst } from "#/tests/support/project-setups.ts";

const checkerProject = "rules";

function refuseAFilteredRun(projects: readonly string[]): void {
  if (!projects.includes(checkerProject) || projects.length < 2) {
    throw new Error(
      `The run holds only the projects ${projects.join(", ")}, so it cannot tell whether the ${checkerProject} project runs before the others. Run it without --project.`,
    );
  }
}

test(`the ${checkerProject} project's sequence group comes before that of every other project`, () => {
  const settings = inject("runSettingsOfEachProject");
  refuseAFilteredRun(Object.keys(settings));
  const others = Object.entries(settings).filter(([name]) => name !== checkerProject);

  expect(Math.min(...others.map(([, { groupOrder }]) => groupOrder))).toBeGreaterThan(
    settings[checkerProject].groupOrder,
  );
});

test("every project builds the packages, with no GIT_ variable left, before any of its tests can read what they build", () => {
  const settings = inject("runSettingsOfEachProject");
  const unbuilt = Object.entries(settings)
    .filter(
      ([, { globalSetup }]) =>
        globalSetup.slice(0, packagesBuiltFirst.length).join() !== packagesBuiltFirst.join(),
    )
    .map(
      ([name, { globalSetup }]) =>
        `${name}: its global setups start with ${globalSetup.join(", ") || "nothing"}. Start them with ${packagesBuiltFirst.join(" and ")}, so a run of this project alone reads a fresh dist.`,
    );

  expect(Object.keys(settings).length).toBeGreaterThan(0);
  expect(unbuilt).toEqual([]);
});
