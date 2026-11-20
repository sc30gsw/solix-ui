import { afterEach, beforeEach } from "vite-plus/test";
import { commands } from "vite-plus/test/browser";
import { startRecording, takeRecord } from "#/story-records.ts";

let onThePageBefore = new Set<Element>();

function canvasOfTheStory(): Element {
  const canvas = [...document.body.children].find((child) => !onThePageBefore.has(child));
  if (canvas === undefined) {
    throw new Error(
      "The story added no element to the page's body, so nothing tells which element is its canvas. Storybook's runStory appends the canvas to the body before it renders; read it again.",
    );
  }
  return canvas;
}

beforeEach(() => {
  onThePageBefore = new Set(document.body.children);
  startRecording();
});

afterEach(async ({ task }) => {
  const { storyId } = task.meta;
  if (storyId === undefined) {
    throw new Error(
      "The story test carries no storyId, so its record names no story. Read how @storybook/addon-vitest sets task.meta again.",
    );
  }
  await commands.recordStory(storyId, takeRecord(canvasOfTheStory()));
});
