import type { StoryIndexEntry } from "storybook/internal/types";
import { beforeAll, describe, expect, inject, test } from "vite-plus/test";
import { enginesToVerify } from "../../../scripts/browser-engines.mjs";
import {
  isTaggedForTheTestRun,
  storiesProjectIn,
  storyFileOf,
  storyIndex,
} from "#/tests/support/stories.ts";

const listing = inject("testFilesOfEachProject");
const indexTimeout = 60_000;
let stories: StoryIndexEntry[] = [];

beforeAll(async () => {
  stories = await storyIndex();
}, indexTimeout);

test("every story Storybook indexes is tagged for the test run", () => {
  expect(stories.length).toBeGreaterThan(0);
  expect(stories.filter((story) => !isTaggedForTheTestRun(story)).map(({ id }) => id)).toEqual([]);
});

describe.each(enginesToVerify())("in %s", (engine) => {
  test("the stories project of vp run verify runs every file of a story Storybook tests, and no file without one", () => {
    const tested = [...new Set(stories.filter(isTaggedForTheTestRun).map(storyFileOf))].sort();
    const run = [...(listing[storiesProjectIn(engine)] ?? [])].sort();

    expect(tested.length).toBeGreaterThan(0);
    expect(run).toEqual(tested);
  });
});
