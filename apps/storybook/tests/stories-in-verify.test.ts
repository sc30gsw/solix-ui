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

const run: StoriesRun = {
  listing: inject("testFilesOfEachProject"),
  settings: inject("runSettingsOfEachProject"),
  engines: enginesToVerify(),
};
const indexTimeout = 60_000;
let stories: StoryIndexEntry[] = [];

beforeAll(async () => {
  refuseARunWithoutTheStoriesProjects(run);
  stories = await storyIndex();
}, indexTimeout);

describe.each(run.engines)("in %s", (engine) => {
  const project = storiesProjectIn(engine);

  test("the stories project of vp run verify lists every file of a story Storybook indexes, and no other", () => {
    const indexed = [...new Set(stories.map(storyFileOf))].sort();

    expect(indexed.length).toBeGreaterThan(0);
    expect([...(run.listing[project] ?? [])].sort()).toEqual(indexed);
  });

  test("the stories project runs every story Storybook indexes: no tag of the test plugin leaves one out, and the project narrows test names no further than the run", () => {
    const settings = run.settings[project];

    expect(settings?.testNamePattern).toBe(settings?.runTestNamePattern);
    expect(
      stories.filter((story) => !isRunByTheProject(story, settings)).map(({ id }) => id),
    ).toEqual([]);
  });
});
