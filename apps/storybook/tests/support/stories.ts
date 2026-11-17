import { join, relative, resolve } from "node:path";
import { buildIndex } from "storybook/internal/core-server";
import type { StoryIndexEntry } from "storybook/internal/types";
import { repositoryRoot } from "../../../../scripts/repository.ts";
import { storiesServer } from "#/tests/support/test-servers.ts";

type TestFilesOfEachProject = Readonly<Record<string, readonly string[]>>;

export const storybookDirectory = join(import.meta.dirname, "../..");

const storybookConfigDirectory = join(storybookDirectory, ".storybook");
const testRunTag = "test";

export async function storyIndex(): Promise<StoryIndexEntry[]> {
  const index = await buildIndex({ configDir: storybookConfigDirectory });
  return Object.values(index.entries).filter(
    (entry): entry is StoryIndexEntry => entry.type === "story",
  );
}

export function storyFileOf({ importPath }: StoryIndexEntry): string {
  return relative(repositoryRoot, resolve(importPath));
}

export function isTaggedForTheTestRun({ tags = [] }: StoryIndexEntry): boolean {
  return tags.includes(testRunTag);
}

export function storiesProjectIn(engine: string): string {
  return `${storiesServer.project} (${engine})`;
}

export function storiesTestedInEveryEngine(
  stories: readonly StoryIndexEntry[],
  listing: TestFilesOfEachProject,
  engines: readonly string[],
): StoryIndexEntry[] {
  return stories.filter(
    (story) =>
      isTaggedForTheTestRun(story) &&
      engines.every((engine) => listing[storiesProjectIn(engine)]?.includes(storyFileOf(story))),
  );
}
