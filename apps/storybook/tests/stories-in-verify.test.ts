import type { StoryIndexEntry } from "storybook/internal/types";
import { beforeAll, describe, expect, inject, test } from "vite-plus/test";
import { enginesToVerify } from "../../../scripts/browser-engines.mjs";
import {
  isRunByTheProject,
  refuseARunWithoutTheStoriesProjects,
  type StoriesRun,
  storiesProjectIn,
  storyFileOf,
  storyIndex,
} from "#/tests/support/stories.ts";
import { storyColorSchemeVariable } from "#/stories-project.ts";
import { storiesServers } from "#/tests/support/test-servers.ts";

const run: StoriesRun = {
  listing: inject("testFilesOfEachProject"),
  runTestNamePattern: inject("runTestNamePattern"),
  settings: inject("runSettingsOfEachProject"),
  engines: enginesToVerify(),
};
const indexTimeout = 60_000;
let stories: StoryIndexEntry[] = [];

beforeAll(async () => {
  refuseARunWithoutTheStoriesProjects(run);
  stories = await storyIndex();
}, indexTimeout);

describe.each(
  run.engines.flatMap((engine) =>
    storiesServers.map((server) => ({ engine, server, label: `${engine}, ${server.colorScheme}` })),
  ),
)("in $label", ({ engine, server }) => {
  const project = storiesProjectIn(engine, server);

  test("the stories project of vp run verify lists every file of a story Storybook indexes, and no other", () => {
    const indexed = [...new Set(stories.map(storyFileOf))].sort();

    expect(indexed.length).toBeGreaterThan(0);
    expect([...(run.listing[project] ?? [])].sort()).toEqual(indexed);
  });

  test("the stories project hands the preview the colour scheme it runs every story in", () => {
    expect(run.settings[project]?.env[storyColorSchemeVariable]).toBe(server.colorScheme);
  });

  test("the stories project runs every story Storybook indexes: no tag of the test plugin leaves one out, and the project narrows test names no further than the run", () => {
    const settings = run.settings[project];
    if (settings === undefined) throw new Error(`${project}: the run gives no settings for it.`);

    expect(settings.testNamePattern).toBe(run.runTestNamePattern);
    expect(
      stories.filter((story) => !isRunByTheProject(story, settings, project)).map(({ id }) => id),
    ).toEqual([]);
  });
});
