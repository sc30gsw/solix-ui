import { expect, inject, test } from "vite-plus/test";

test("every project that runs its tests in a browser engine runs after every project that does not, so the type checker's whole-repository rules never share the machine with the browser projects", () => {
  const projects = Object.values(inject("runSettingsOfEachProject"));
  const inABrowser = projects
    .filter(({ inABrowser }) => inABrowser)
    .map(({ groupOrder }) => groupOrder);
  const outside = projects
    .filter(({ inABrowser }) => !inABrowser)
    .map(({ groupOrder }) => groupOrder);

  expect(inABrowser).not.toEqual([]);
  expect(outside).not.toEqual([]);
  expect(Math.min(...inABrowser)).toBeGreaterThan(Math.max(...outside));
});
