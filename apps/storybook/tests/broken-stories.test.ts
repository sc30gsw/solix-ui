import { join } from "node:path";
import { beforeAll, describe, expect, test } from "vite-plus/test";
import { enginesToVerify } from "../../../scripts/browser-engines.mjs";
import type * as BrokenStories from "#/fixtures/Broken.stories.tsx";
import { runVitest } from "#/tests/support/child-runs.ts";
import { storybookDirectory } from "#/tests/support/stories.ts";
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
  AccessibilityTestOff: 'a11y.test is "off"',
  AccessibilityTestTodo: 'a11y.test is "todo"',
  AccessibilityDisabled: "a11y.disable is true",
  AccessibilityRulesNarrowed: 'a11y.options is {"runOnly":["region"]}',
  AccessibilityRuleTurnedOff: "a11y.config is",
  AccessibilityLeftToSomeone: "globals.a11y.manual is true",
};

const fixturesDirectory = join(storybookDirectory, "fixtures");
const brokenStoriesRunTimeout = 240_000;
const telemetry = collectTelemetry(brokenStoriesTelemetryPort);
const storyNameSeparator = /(?<=[a-z])(?=[A-Z])/g;

function titleOf(story: string): string {
  return story.replace(storyNameSeparator, " ");
}

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
    for (const { title, status, failureMessages } of "tests" in run.report
      ? run.report.tests
      : []) {
      outcomes.set(title, { status, messages: failureMessages.join("\n") });
    }
  }, brokenStoriesRunTimeout);

  test.each(Object.entries(reasonOf))(
    "fails %s for its own reason, %s, and for no other broken story's",
    (story, reason) => {
      const outcome = outcomes.get(titleOf(story));
      const otherReasons = Object.values(reasonOf).filter((other) => other !== reason);

      expect(outcome?.status, printed).toBe("failed");
      expect(outcome?.messages).toContain(reason);
      expect(otherReasons.filter((other) => outcome?.messages.includes(other))).toEqual([]);
    },
  );

  test("runs no story but the broken ones", () => {
    expect([...outcomes.keys()].sort(), printed).toEqual(Object.keys(reasonOf).map(titleOf).sort());
  });
});

test("no broken-story run sends Storybook telemetry", () => {
  expect(telemetry.received()).toEqual([]);
});
