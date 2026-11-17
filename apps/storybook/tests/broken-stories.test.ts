import { join } from "node:path";
import { storyNameFromExport } from "storybook/internal/csf";
import { describe, expect, test } from "vite-plus/test";
import { enginesToVerify } from "../../../scripts/browser-engines.mjs";
import type * as BrokenStories from "#/fixtures/Broken.stories.tsx";
import { storybookDirectory } from "#/tests/support/stories.ts";
import { brokenStoriesRun, brokenStoriesTelemetryPort } from "#/tests/support/test-servers.ts";
import { collectTelemetry, telemetryUrlVariable } from "#/tests/support/telemetry-collector.ts";
import { runVitest } from "#/tests/support/vitest-run.ts";

type BrokenStory = Exclude<keyof typeof BrokenStories, "default">;

const reasonOf: { [Story in BrokenStory]: string } = {
  NoAccessibleName: "button-name",
  TargetTooSmall: "target-size",
  PlayFunctionFails: "toHaveTextContent",
  EffectWithoutOwner: "NO_OWNER_EFFECT",
  WriteInAnOwnedScope: "REACTIVE_WRITE_IN_OWNED_SCOPE",
};

const fixturesDirectory = join(storybookDirectory, "fixtures");
const aloneTimeout = 180_000;
const telemetry = collectTelemetry(brokenStoriesTelemetryPort);

function escapedForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe.each(enginesToVerify())("in %s", (engine) => {
  test.each(Object.entries(reasonOf))(
    "the broken story %s fails when it runs alone, for its own reason, %s, and for no other broken story's",
    async (story, reason) => {
      const title = storyNameFromExport(story);
      const run = await runVitest(
        fixturesDirectory,
        [
          "--config",
          "vite.config.ts",
          "--project",
          `${brokenStoriesRun.project} (${engine})`,
          "-t",
          `^${escapedForRegExp(title)}$`,
        ],
        { [telemetryUrlVariable]: telemetry.url },
      );
      const ran = run.tests.filter(({ status }) => status !== "skipped");
      const messages = ran.flatMap(({ failureMessages }) => failureMessages).join("\n");
      const otherReasons = Object.values(reasonOf).filter((other) => other !== reason);

      expect(
        ran.map(({ title: ranTitle, status }) => ({ ranTitle, status })),
        run.output,
      ).toEqual([{ ranTitle: title, status: "failed" }]);
      expect(run.exitCode).not.toBe(0);
      expect(messages).toContain(reason);
      expect(otherReasons.filter((other) => messages.includes(other))).toEqual([]);
    },
    aloneTimeout,
  );
});

test("no story run sends Storybook telemetry", () => {
  expect(telemetry.received()).toEqual([]);
});
