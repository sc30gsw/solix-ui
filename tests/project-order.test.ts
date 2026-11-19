import { expect, inject, test } from "vite-plus/test";

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
