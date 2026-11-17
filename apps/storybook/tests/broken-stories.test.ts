import { join } from "node:path";
import { beforeAll, describe, expect, test } from "vite-plus/test";
import { enginesToVerify } from "../../../scripts/browser-engines.mjs";
import type * as BrokenStories from "#/fixtures/Broken.stories.tsx";
import { childRunMargin, runVitest } from "#/tests/support/child-runs.ts";
import {
  brokenStoriesConfigDirectory,
  storybookDirectory,
  storyIndex,
} from "#/tests/support/stories.ts";
import { collectTelemetry, telemetryUrlVariable } from "#/tests/support/telemetry-collector.ts";
import { brokenStoriesServer, brokenStoriesTelemetryPort } from "#/tests/support/test-servers.ts";

type BrokenStory = Exclude<keyof typeof BrokenStories, "default">;

type Outcome = { status: string; messages: string };

const reasonOf: { [Story in BrokenStory]: string } = {
  NoAccessibleName: "button-name",
  TargetTooSmall: "target-size",
  PlayFunctionFails: "toHaveTextContent",
  EffectWithoutOwner: "NO_OWNER_EFFECT",
  CleanupWithoutOwner: "NO_OWNER_CLEANUP",
  AccessibilityTestOff: 'before it ran:\na11y.test is "off"',
  AccessibilityTestTodo: 'a11y.test is "todo"',
  AccessibilityDisabled: "a11y.disable is true",
  AccessibilityRulesNarrowed: 'a11y.options is {"runOnly":["region"]}',
  AccessibilityRuleTurnedOff: "a11y.config is",
  AccessibilityLeftToAManualRun: "globals.a11y.manual is true",
  AccessibilitySkippedAsAGhost: "globals.ghostStories is true",
  RenderedWhereTheScanDoesNotLook: "the canvas holds .sb-wrapper",
  PlayTurnsTheCheckOff: 'while it ran:\na11y.test is "off"',
  NamelessLinkAfterAWrite: "link-name",
};

const fixturesDirectory = join(storybookDirectory, "fixtures");
const brokenStoriesRunTimeout = 240_000;
const indexTimeout = 60_000;
const telemetry = collectTelemetry(brokenStoriesTelemetryPort);
const idOf = new Map<string, string>();

function storyIdOf(story: string): string {
  const id = idOf.get(story);
  if (id === undefined)
    throw new Error(`${story}: Storybook's index of the fixtures holds no such story.`);
  return id;
}

beforeAll(async () => {
  for (const { exportName, id } of await storyIndex(brokenStoriesConfigDirectory)) {
    if (exportName !== undefined) idOf.set(exportName, id);
  }
}, indexTimeout);

describe.each(enginesToVerify())("in %s, one run of every broken story", (engine) => {
  const outcomes = new Map<string, Outcome>();
  let runOutput = "";

  beforeAll(async () => {
    const run = await runVitest(
      fixturesDirectory,
      ["--config", "vite.config.ts", "--project", `${brokenStoriesServer.project} (${engine})`],
      { [telemetryUrlVariable]: telemetry.url },
      brokenStoriesRunTimeout,
    );
    runOutput = "unreadable" in run.report ? `${run.report.unreadable}\n${run.output}` : run.output;
    for (const { id, status, messages } of "tests" in run.report ? run.report.tests : []) {
      outcomes.set(id, { status, messages: messages.join("\n") });
    }
  }, brokenStoriesRunTimeout + childRunMargin);

  test.each(Object.entries(reasonOf))(
    "fails %s for its own reason, %s, and for no other broken story's",
    (story, reason) => {
      const outcome = outcomes.get(storyIdOf(story));
      const otherReasons = Object.values(reasonOf).filter((other) => other !== reason);

      expect(outcome?.status, runOutput).toBe("failed");
      expect(outcome?.messages).toContain(reason);
      expect(otherReasons.filter((other) => outcome?.messages.includes(other))).toEqual([]);
    },
  );

  test("runs every broken story Storybook indexes, and no other", () => {
    expect([...outcomes.keys()].sort(), runOutput).toEqual(
      Object.keys(reasonOf).map(storyIdOf).sort(),
    );
  });
});

test("no broken-story run sends Storybook telemetry", () => {
  expect(telemetry.received()).toEqual([]);
});
