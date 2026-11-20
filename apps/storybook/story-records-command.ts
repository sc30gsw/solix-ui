import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { StoryRecord } from "#/story-records.ts";

declare module "vite-plus/test" {
  interface ProvidedContext {
    storyRecords: string;
  }
  interface TaskMeta {
    storyId?: string;
  }
}

export type RecordedStory = StoryRecord & { readonly storyId: string; readonly project: string };

export const storyRecordsFile = "records.jsonl";
const storyRecordsHome = join(import.meta.dirname, "../../node_modules/.story-records");

export function storyRecordsOfThisRun(): string {
  return join(storyRecordsHome, randomUUID());
}

export function recordStoryCommand(directory: string) {
  return (context: { project: { name: string } }, storyId: string, record: StoryRecord) => {
    mkdirSync(directory, { recursive: true });
    const line: RecordedStory = { ...record, storyId, project: context.project.name };
    appendFileSync(join(directory, storyRecordsFile), `${JSON.stringify(line)}\n`);
  };
}

export function recordedStories(directory: string): RecordedStory[] {
  const file = join(directory, storyRecordsFile);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RecordedStory);
}
