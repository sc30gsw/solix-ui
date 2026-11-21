import { afterEach, beforeEach } from "vite-plus/test";
import { commands, server } from "vite-plus/test/browser";
import {
  type Mount,
  startRecording,
  type Substitution,
  substitutionsOf,
  substitutionTookPlace,
  takeRecord,
} from "#/story-records.ts";
import { lastStoryRun } from "#/story-run.ts";

const substitutingEngine = "chromium";
const substitutionsTimeout = 600_000;

type RunnableStory = {
  readonly run: () => Promise<void>;
  readonly reporting: { readonly reports: unknown[] };
};

function isRunnableStory(story: unknown): story is RunnableStory {
  return (
    typeof story === "function" &&
    typeof Reflect.get(story, "run") === "function" &&
    Array.isArray(Reflect.get(Reflect.get(story, "reporting") ?? {}, "reports"))
  );
}

function canvasOfTheStory(): Element {
  const { canvas } = lastStoryRun();
  if (canvas === undefined) {
    throw new Error(
      "The story never resolved its mount, so no canvas tells which mounts it shows. The preview's beforeEach wraps the story context's mount and passes on its canvasElement; read it again.",
    );
  }
  return canvas;
}

async function ranAgain(story: RunnableStory, substitution?: Substitution): Promise<unknown> {
  const reports = [...story.reporting.reports];
  startRecording(substitution);
  let failure: unknown;
  try {
    await story.run();
  } catch (error) {
    failure = error ?? new Error("The story failed with no error.");
  }
  story.reporting.reports.splice(0, story.reporting.reports.length, ...reports);
  return failure;
}

function named({ component, prop, value }: Substitution): string {
  return `${component}'s ${prop}${value === undefined ? "" : ` as ${JSON.stringify(value)}`}`;
}

async function failsInItsPlay(story: RunnableStory, substitution: Substitution): Promise<boolean> {
  const failed = (await ranAgain(story, substitution)) !== undefined;
  const { mounted, playReturned } = lastStoryRun();
  const tookPlace = substitutionTookPlace();
  const again = await ranAgain(story);
  if (again !== undefined) {
    throw new Error(
      `The story passed as written, ran with ${named(substitution)} substituted, and then failed as written, so a failure of its play tells nothing about what it checks. Reset in the story's beforeEach what its play or render leaves changed for the next run.`,
      { cause: again },
    );
  }
  return failed && mounted && !playReturned && tookPlace;
}

function keyOf({ component, prop, value }: Substitution): string {
  return JSON.stringify([component, prop, value]);
}

async function substituted(story: RunnableStory, mounts: readonly Mount[]): Promise<void> {
  const played = new Set<string>();
  for (const mount of mounts) {
    for (const substitution of substitutionsOf(mount)) {
      if (played.has(keyOf(substitution))) continue;
      if (!(await failsInItsPlay(story, substitution))) continue;
      played.add(keyOf(substitution));
      mount.played.push({
        prop: substitution.prop,
        ...("value" in substitution ? { value: substitution.value } : {}),
      });
    }
  }
}

beforeEach(() => {
  startRecording();
});

afterEach(async (context) => {
  const { storyId } = context.task.meta;
  if (storyId === undefined) {
    throw new Error(
      "The story test carries no storyId, so its record names no story. Read how @storybook/addon-vitest sets task.meta again.",
    );
  }
  const failed = context.task.result?.state === "fail";
  if (failed && lastStoryRun().canvas === undefined) return;
  const mounts = takeRecord(canvasOfTheStory());
  const { playOfEveryValue } = lastStoryRun();
  const story: unknown = Reflect.get(context, "story");
  const substituting = server.browser === substitutingEngine && !failed;
  if (substituting) {
    if (!isRunnableStory(story)) {
      throw new Error(
        "The story test's context carries no composed story to run again, so no value can be substituted. Read how @storybook/addon-vitest sets context.story again.",
      );
    }
    if (!playOfEveryValue) await substituted(story, mounts);
  }
  await commands.recordStory(storyId, { substituted: substituting, mounts });
}, substitutionsTimeout);
