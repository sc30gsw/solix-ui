import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { BrowserCommand, TestProject } from "vite-plus/test/node";
import type { StoryRecord } from "#/story-records.ts";

declare module "vite-plus/test" {
  interface ProvidedContext {
    storyRecords?: string;
  }
  interface TaskMeta {
    storyId?: string;
  }
}

export type RecordedStory = StoryRecord & { readonly storyId: string };

const recordFile = /\.json$/;

export const recordStory: BrowserCommand<[storyId: string, record: StoryRecord]> = (
  { project },
  storyId,
  record,
) => {
  const directory = project.getProvidedContext().storyRecords;
  if (directory === undefined) return;
  const file = join(
    directory,
    encodeURIComponent(project.name),
    `${encodeURIComponent(storyId)}.json`,
  );
  mkdirSync(dirname(file), { recursive: true });
  const recordedStory: RecordedStory = { ...record, storyId };
  writeFileSync(file, JSON.stringify(recordedStory));
};

export function setup(project: TestProject): () => void {
  const directory = mkdtempSync(join(tmpdir(), "solix-story-records-"));
  project.vitest.provide("storyRecords", directory);
  return () => rmSync(directory, { recursive: true, force: true });
}

export function recordedStories(directory: string): RecordedStory[] {
  return readdirSync(directory, { recursive: true, encoding: "utf8" })
    .filter((file) => recordFile.test(file))
    .map((file) => JSON.parse(readFileSync(join(directory, file), "utf8")) as RecordedStory);
}
