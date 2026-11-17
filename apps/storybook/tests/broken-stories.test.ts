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
  AccessibilityTestOff: 'before it ran, a11y.test is "off"',
  AccessibilityTestTodo: 'before it ran, a11y.test is "todo"',
  AccessibilityDisabled: "before it ran, a11y.disable is true",
  AccessibilityRulesNarrowed: 'before it ran, a11y.options is {"runOnly":["region"]}',
  AccessibilityRuleTurnedOff: "before it ran, a11y.config is",
  AccessibilityLeftToSomeone: "before it ran, globals.a11y.manual is true",
  AccessibilitySkippedAsAGhost: "before it ran, globals.ghostStories is true",
  RenderedWhereTheScanDoesNotLook: "the canvas holds .sb-wrapper",
  PlayTurnsTheCheckOff: 'while it ran, a11y.test is "off"',
};

const fixturesDirectory = join(storybookDirectory, "fixtures");
const brokenStoriesRunTimeout = 240_000;
const indexTimeout = 60_000;
const telemetry = collectTelemetry(brokenStoriesTelemetryPort);
const idOf = new Map<string, string>();

beforeAll(async () => {
  for (const { exportName, id } of await storyIndex(brokenStoriesConfigDirectory)) {
    if (exportName !== undefined) idOf.set(exportName, id);
  }
}, indexTimeout);

describe.each(enginesToVerify())("in %s, one run of every broken story", (engine) => {
  const outcomes = new Map<string, Outcome>();
  let printed = "";

  beforeAll(async () => {
    const run = await runVitest(
      fixturesDirectory,
      ["--config", "vite.config.ts", "--project", `${brokenStoriesServer.project} (${engine})`],
      { [telemetryUrlVariable]: telemetry.url },
      brokenStoriesRunTimeout,
    );
    printed = "missing" in run.report ? `${run.report.missing}\n${run.output}` : run.output;
    for (const { id, status, messages } of "tests" in run.report ? run.report.tests : []) {
      outcomes.set(id, { status, messages: messages.join("\n") });
    }
  }, brokenStoriesRunTimeout + childRunMargin);

  test.each(Object.entries(reasonOf))(
    "fails %s for its own reason, %s, and for no other broken story's",
    (story, reason) => {
      const outcome = outcomes.get(idOf.get(story) ?? story);
      const otherReasons = Object.values(reasonOf).filter((other) => other !== reason);

      expect(outcome?.status, printed).toBe("failed");
      expect(outcome?.messages).toContain(reason);
      expect(otherReasons.filter((other) => outcome?.messages.includes(other))).toEqual([]);
    },
  );

  test("runs every broken story Storybook indexes, and no other", () => {
    expect([...outcomes.keys()].sort(), printed).toEqual(
      Object.keys(reasonOf)
        .map((story) => idOf.get(story) ?? story)
        .sort(),
    );
  });
});

test("no broken-story run sends Storybook telemetry", () => {
  expect(telemetry.received()).toEqual([]);
});
