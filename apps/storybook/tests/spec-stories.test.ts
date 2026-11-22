import type { StoryIndexEntry } from "storybook/internal/types";
import { beforeAll, describe, test } from "vite-plus/test";
import { checksBy, held } from "../../../packages/core/spec/format.ts";
import { functionSpecs } from "../../../packages/core/spec/specs.ts";
import { storyFileOf, storyIndex } from "#/tests/support/stories.ts";

const indexTimeout = 60_000;
const playTag = "play-fn";
let stories: StoryIndexEntry[] = [];

beforeAll(async () => {
  stories = await storyIndex();
}, indexTimeout);

function storyOf(file: string, name: string): StoryIndexEntry {
  const found = stories.find((entry) => storyFileOf(entry) === file && entry.exportName === name);
  if (found === undefined) throw new Error(`${file}: Storybook indexes no story ${name}.`);
  return found;
}

for (const spec of functionSpecs.filter((each) => checksBy(each, "story").length > 0)) {
  describe(spec.name, () => {
    for (const entry of checksBy(spec, "story")) {
      test(`${entry.says}, played by the story ${entry.check.story}`, () =>
        held(entry, () => {
          const file = `apps/storybook/src/${entry.check.stories}.stories.tsx`;
          const indexed = storyOf(file, entry.check.story);
          if (!(indexed.tags ?? []).includes(playTag)) {
            throw new Error(`${file}: the story ${entry.check.story} has no play function.`);
          }
        }));
    }
  });
}
