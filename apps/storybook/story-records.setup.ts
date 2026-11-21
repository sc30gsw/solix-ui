import { afterEach, beforeEach, inject } from "vite-plus/test";
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
const substitutingScheme = "light";
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

function named({ component, prop, value }: Substitution): string {
  return `${component}'s ${prop}${value === undefined ? "" : ` as ${JSON.stringify(value)}`}`;
}

function outOfTime(timeout: number, substitution: Substitution | undefined): Error {
  const how = substitution === undefined ? "as written" : `with ${named(substitution)} substituted`;
  return new Error(
    `The story ran again ${how} and did not end within its timeout of ${timeout} ms, so that run counts as failed.`,
  );
}

async function ranAgain(
  story: RunnableStory,
  timeout: number,
  substitution?: Substitution,
): Promise<unknown> {
  const reports = story.reporting.reports.splice(0);
  startRecording(substitution);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<unknown>((resolve) => {
    timer = setTimeout(() => resolve(outOfTime(timeout, substitution)), timeout);
  });
  const ended = story.run().then(
    () => undefined,
    (error: unknown) => error ?? new Error("The story failed with no error."),
  );
  try {
    return await Promise.race([ended, timedOut]);
  } finally {
    clearTimeout(timer);
    story.reporting.reports.splice(0, story.reporting.reports.length, ...reports);
  }
}

function passedAgain(failure: unknown, when: string): void {
  if (failure === undefined) return;
  throw new Error(
    `The story passed as written and then failed as written ${when}, so a failure of its play tells nothing about what it checks. Reset in the story's beforeEach what its play or render leaves changed for the next run.`,
    { cause: failure },
  );
}

async function failsInItsPlay(
  story: RunnableStory,
  timeout: number,
  substitution: Substitution,
): Promise<boolean> {
  const failed = (await ranAgain(story, timeout, substitution)) !== undefined;
  const { mounted, playReturned } = lastStoryRun();
  const tookPlace = substitutionTookPlace();
  passedAgain(
    await ranAgain(story, timeout),
    `right after it ran with ${named(substitution)} substituted`,
  );
  return failed && mounted && !playReturned && tookPlace;
}

function keyOf({ component, prop, value }: Substitution): string {
  return JSON.stringify([component, prop, value]);
}

async function substituted(
  story: RunnableStory,
  timeout: number,
  mounts: readonly Mount[],
): Promise<void> {
  const played = new Set<string>();
  let ranBefore = false;
  for (const mount of mounts) {
    for (const substitution of substitutionsOf(mount)) {
      if (played.has(keyOf(substitution))) continue;
      if (!ranBefore) {
        passedAgain(await ranAgain(story, timeout), "when it ran again before any substitution");
        ranBefore = true;
      }
      if (!(await failsInItsPlay(story, timeout, substitution))) continue;
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
  const substituting =
    server.browser === substitutingEngine &&
    inject("storyColorScheme") === substitutingScheme &&
    !failed;
  if (substituting) {
    if (!isRunnableStory(story)) {
      throw new Error(
        "The story test's context carries no composed story to run again, so no value can be substituted. Read how @storybook/addon-vitest sets context.story again.",
      );
    }
    if (!playOfEveryValue) await substituted(story, context.task.timeout, mounts);
  }
  await commands.recordStory(storyId, { substituted: substituting, mounts });
}, substitutionsTimeout);
