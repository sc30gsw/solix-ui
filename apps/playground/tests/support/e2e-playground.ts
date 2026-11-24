import { type Browser, test as base } from "@e2e-dev/web";
import { type App, expect, type Locator, type Screen } from "e2e";
import { type Expected, expectedValues } from "../../../../scripts/expected-values";
import {
  consoleProblemsKey,
  type ExpectedReport,
  isExpected,
  recordConsoleProblems,
  recordedConsoleProblems,
  recorderDidNotRun,
} from "../../../../tests/support/console-recorder";
import { hydratedMark } from "#/src/hydrated-mark.ts";
import { hydrationTimeout, notReady } from "#/tests/support/readiness.ts";
import { readTarget, type Target } from "#/tests/support/targets.ts";

export type StyleOf = (target: Target, property: string) => Promise<string>;

const commitTarget: Target = { role: "button", name: "Default" };

function consoleProblems(browser: Browser): Promise<string[]> {
  return browser.evaluate(recordedConsoleProblems, [consoleProblemsKey, recorderDidNotRun]);
}

export async function openedHydrated(app: App, browser: Browser): Promise<void> {
  await browser.addInitScript(recordConsoleProblems, consoleProblemsKey);
  await app.open("/");
  try {
    await browser
      .locator(`html[${hydratedMark}]`)
      .waitFor({ state: "attached", timeout: hydrationTimeout });
  } catch (cause) {
    throw notReady(hydrationTimeout, await consoleProblems(browser), cause);
  }
}

export function located(screen: Screen, target: Target): Locator {
  return "text" in target
    ? screen.getByText(target.text)
    : screen.getByRole(target.role, target.name);
}

export async function committed(screen: Screen, field: Target, value: string): Promise<void> {
  await located(screen, field).fill(value);
  await located(screen, commitTarget).focus();
}

export const test = base.extend<{
  reportsToTheConsole: ExpectedReport | undefined;
  hydrated: Browser;
  expected: Expected;
  styleOf: StyleOf;
}>({
  reportsToTheConsole: async ({ platform: _platform }, use) => {
    await use(undefined);
  },
  hydrated: [
    async ({ app, browser, reportsToTheConsole }, use) => {
      await openedHydrated(app, browser);
      await use(browser);
      expect(
        (await consoleProblems(browser)).filter(
          (problem) => !isExpected(problem, reportsToTheConsole),
        ),
        "the console errors, warnings and page errors the page reported during this test. Fix their cause, or give the test the message it must report as reportsToTheConsole.",
      ).toEqual([]);
    },
    { auto: true },
  ],
  expected: async ({ hydrated }, use) => {
    await use(await expectedValues((probe, input) => hydrated.evaluate(probe, input)));
  },
  styleOf: async ({ hydrated }, use) => {
    await use((target, property) => hydrated.evaluate(readTarget, { target, style: property }));
  },
});
