import { afterEach, beforeEach } from "vite-plus/test";
import { commands } from "vite-plus/test/browser";
import { type StoryRecord, startRecording, takeRecord } from "#/story-records.ts";

const recordCommand = "recordStory";

function sent(storyId: string, record: StoryRecord): Promise<unknown> {
  const command: unknown = Reflect.get(commands, recordCommand);
  if (typeof command !== "function") {
    throw new Error(
      `The stories project gives no ${recordCommand} browser command, so no story's record reaches the spec test. Add it as apps/storybook/stories-project.ts does.`,
    );
  }
  return Promise.resolve(Reflect.apply(command, commands, [storyId, record]));
}

beforeEach(() => {
  startRecording();
});

afterEach(async ({ task }) => {
  const { storyId } = task.meta;
  if (storyId === undefined) {
    throw new Error(
      "The story test carries no storyId, so its record names no story. Read how @storybook/addon-vitest sets task.meta again.",
    );
  }
  await sent(storyId, takeRecord());
});
