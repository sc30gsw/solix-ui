import { join, relative, resolve } from "node:path";
import { buildIndex } from "storybook/internal/core-server";
import type { StoryIndexEntry } from "storybook/internal/types";
import { repositoryRoot } from "../../../../scripts/repository.ts";
import type { RunSettings } from "../../../../tests/support/global-setup.ts";
import { storiesServer } from "#/tests/support/test-servers.ts";

type TestFilesOfEachProject = Readonly<Record<string, readonly string[]>>;

export type StoriesRun = {
  listing: TestFilesOfEachProject;
  settings: Readonly<Record<string, RunSettings>>;
  engines: readonly string[];
};

export const storybookDirectory = join(import.meta.dirname, "../..");
export const brokenStoriesConfigDirectory = join(storybookDirectory, "fixtures/.storybook");

const storybookConfigDirectory = join(storybookDirectory, ".storybook");
const tagsThePluginIncludesByDefault = ["test"];
const includedTagsVariable = "__VITEST_INCLUDE_TAGS__";
const excludedTagsVariable = "__VITEST_EXCLUDE_TAGS__";
const skippedTagsVariable = "__VITEST_SKIP_TAGS__";

export async function storyIndex(
  configDir: string = storybookConfigDirectory,
): Promise<StoryIndexEntry[]> {
  const index = await buildIndex({ configDir });
  return Object.values(index.entries).filter(
    (entry): entry is StoryIndexEntry => entry.type === "story",
  );
}

export function storyFileOf({ importPath }: StoryIndexEntry): string {
  return relative(repositoryRoot, resolve(importPath));
}

export function storiesProjectIn(engine: string): string {
  return `${storiesServer.project} (${engine})`;
}

export function refuseARunWithoutTheStoriesProjects({ listing, engines }: StoriesRun): void {
  const missing = engines.filter((engine) => listing[storiesProjectIn(engine)] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `The run holds no stories project for ${missing.join(", ")}, so it cannot tell which stories run. Run it without --project.`,
    );
  }
}

function tagsIn(env: Readonly<Record<string, string>>, variable: string): string[] | undefined {
  return env[variable]?.split(",").filter((tag) => tag !== "");
}

export function isRunByTheProject(story: StoryIndexEntry, settings: RunSettings | undefined) {
  const tags = story.tags ?? [];
  const env = settings?.env ?? {};
  const included = tagsIn(env, includedTagsVariable) ?? tagsThePluginIncludesByDefault;
  const leftOut = [
    ...(tagsIn(env, excludedTagsVariable) ?? []),
    ...(tagsIn(env, skippedTagsVariable) ?? []),
  ];
  return (
    settings !== undefined &&
    (included.length === 0 || included.some((tag) => tags.includes(tag))) &&
    !leftOut.some((tag) => tags.includes(tag))
  );
}

export function storiesRunInEveryEngine(
  stories: readonly StoryIndexEntry[],
  { listing, settings, engines }: StoriesRun,
): StoryIndexEntry[] {
  return stories.filter((story) =>
    engines.every((engine) => {
      const project = storiesProjectIn(engine);
      const projectSettings = settings[project];
      return (
        listing[project]?.includes(storyFileOf(story)) === true &&
        projectSettings?.testNamePattern === projectSettings?.runTestNamePattern &&
        isRunByTheProject(story, projectSettings)
      );
    }),
  );
}
