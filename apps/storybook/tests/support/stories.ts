import { dirname, join, relative, resolve } from "node:path";
import { buildIndex } from "storybook/internal/core-server";
import type { StoryIndexEntry } from "storybook/internal/types";
import { storybookAppManifest } from "../../../../scripts/release-sources.ts";
import { repositoryRoot } from "../../../../scripts/repository.ts";
import type {
  RunSettings,
  TestFilesOfEachProject,
} from "../../../../tests/support/global-setup.ts";
import { storiesServer } from "#/tests/support/test-servers.ts";

export type StoriesRun = {
  listing: TestFilesOfEachProject;
  runTestNamePattern: string | null;
  settings: Readonly<Record<string, RunSettings>>;
  engines: readonly string[];
};

export const storybookDirectory = join(repositoryRoot, dirname(storybookAppManifest));
export const brokenStoriesConfigDirectory = join(storybookDirectory, "fixtures/.storybook");

const storybookConfigDirectory = join(storybookDirectory, ".storybook");
const tagVariablesOfTheTestPlugin = {
  included: "__VITEST_INCLUDE_TAGS__",
  excluded: "__VITEST_EXCLUDE_TAGS__",
  skipped: "__VITEST_SKIP_TAGS__",
} as const;

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

function tagsIn({ env }: RunSettings, project: string, variable: string): string[] {
  const tags = env[variable];
  if (tags === undefined) {
    throw new Error(
      `${project}: its env holds no ${variable}, which Storybook's test plugin writes, so nothing tells which stories it runs. Read the plugin's tag variables in @storybook/addon-vitest/dist/vitest-plugin again.`,
    );
  }
  return tags.split(",").filter((tag) => tag !== "");
}

export function isRunByTheProject(
  story: StoryIndexEntry,
  settings: RunSettings,
  project: string,
): boolean {
  const tags = story.tags ?? [];
  const included = tagsIn(settings, project, tagVariablesOfTheTestPlugin.included);
  const leftOut = [
    ...tagsIn(settings, project, tagVariablesOfTheTestPlugin.excluded),
    ...tagsIn(settings, project, tagVariablesOfTheTestPlugin.skipped),
  ];
  return (
    (included.length === 0 || included.some((tag) => tags.includes(tag))) &&
    !leftOut.some((tag) => tags.includes(tag))
  );
}
