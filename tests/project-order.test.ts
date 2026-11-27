import { expect, inject, test } from "vite-plus/test";
import { packagesBuiltFirst } from "#/tests/support/project-setups.ts";
import { allProjectSettings } from "#/tests/support/run-settings.ts";

const checkerProject = "rules";
const browserProject = "browser";

function isOf(name: string, project: string): boolean {
  return name === project || name.startsWith(`${project} (`);
}

test(`the ${checkerProject} project's sequence group comes before that of every other project`, () => {
  const settings = allProjectSettings(
    `whether the ${checkerProject} project runs before the others`,
  );
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

test("no browser project saves a screenshot when a test fails: every project whose browser is enabled resolves screenshotFailures to false", () => {
  const settings = allProjectSettings(
    "whether every project whose browser is enabled saves no screenshot",
  );
  const inABrowser = Object.entries(settings).filter(([, { browser }]) => browser.enabled);
  const screenshotting = inABrowser
    .filter(([, { browser }]) => browser.screenshotFailures)
    .map(
      ([name]) =>
        `${name}: it saves a screenshot of each failed test. Set screenshotFailures: false in the browser block of scripts/browser-instances.ts; a failure reports values, not pixels.`,
    );

  expect(inABrowser.length).toBeGreaterThan(0);
  expect(screenshotting).toEqual([]);
});

test(`the ${browserProject} project's instances run in a sequence group no other project shares, so no other project's engines load the machine while its timed properties run`, () => {
  const settings = allProjectSettings(
    `whether the ${browserProject} project's instances share a sequence group with another project`,
  );
  const isBrowser = (name: string) => isOf(name, browserProject);
  const browserGroups = new Set(
    Object.entries(settings)
      .filter(([name]) => isBrowser(name))
      .map(([, { groupOrder }]) => groupOrder),
  );
  const sharing = Object.entries(settings)
    .filter(([name, { groupOrder }]) => !isBrowser(name) && browserGroups.has(groupOrder))
    .map(
      ([name, { groupOrder }]) =>
        `${name}: it runs in sequence group ${groupOrder} beside the ${browserProject} project. Give the ${browserProject} project a group of its own in vite.config.ts.`,
    );

  expect(browserGroups.size).toBeGreaterThan(0);
  expect(sharing).toEqual([]);
});
