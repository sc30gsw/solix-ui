import fc from "fast-check";
import { describe, expect, test } from "vite-plus/test";
import { assertProperty, type PropertyParameters } from "#/tests/support/properties.ts";

const shortTimeout = 4_000;
const longTimeout = 12_000;
const runTime = 100;
const slowRuns = 100;
const quickRuns = 10;
const runsPastTheShortLimit = 50;
const runsForHalfTheShortTimeout = 20;
const waitBeforeTheRetry = 3_000;
const attemptsAfterAStall = 2;
const failure =
  /^Property failed after 1 tests\n\{ seed: -?\d+, path: "0(?::\d+)*", endOnFailure: true \}\nCounterexample: \[\d+\]\nShrunk \d+ time\(s\)/;
const interruption = /^Property interrupted after \d+ tests\n\{ seed: -?\d+ \}/;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const slow = fc.asyncProperty(fc.nat(), async () => {
  await delay(runTime);
});

export function definePropertyRunnerTests(): void {
  test(
    "a property that fails and is still shrinking when its time runs out reports its seed, its path and its counterexample before the test's timeout",
    { timeout: shortTimeout, retry: attemptsAfterAStall },
    async (context) => {
      await expect(
        assertProperty(
          context,
          fc.asyncProperty(fc.maxSafeNat(), async (value) => {
            await delay(runTime);
            expect(value).toBe(0);
          }),
          { examples: [[Number.MAX_SAFE_INTEGER]] },
        ),
      ).rejects.toThrow(failure);
    },
  );

  test(
    "a property that passes but runs out of time fails, with its seed, before the test's timeout",
    { timeout: shortTimeout, retry: attemptsAfterAStall },
    async (context) => {
      await expect(assertProperty(context, slow, { numRuns: slowRuns })).rejects.toThrow(
        interruption,
      );
    },
  );

  test(
    "a second property in the same test gets only the time the test has left",
    { timeout: shortTimeout, retry: attemptsAfterAStall },
    async (context) => {
      await assertProperty(context, slow, { numRuns: quickRuns });
      await expect(assertProperty(context, slow, { numRuns: slowRuns })).rejects.toThrow(
        interruption,
      );
    },
  );

  test(
    "a retry gets the whole time limit again, counted from the end of the wait before it, and so does a repetition, which waits for nothing",
    { timeout: shortTimeout, retry: { count: 1, delay: waitBeforeTheRetry }, repeats: 1 },
    async (context) => {
      const attemptsBefore = context.task.result?.attempts?.length;
      if (attemptsBefore === 0) throw new Error("The first attempt fails, so the test is retried.");
      if (attemptsBefore !== 1 && attemptsBefore !== 2) {
        throw new Error("The repetition failed, so it was retried too.");
      }
      await assertProperty(context, slow, { numRuns: runsForHalfTheShortTimeout });
      if (attemptsBefore === 1) return;
      await expect(assertProperty(context, slow, { numRuns: slowRuns })).rejects.toThrow(
        interruption,
      );
    },
  );

  describe.concurrent("two tests that run at once keep their own time limits", () => {
    test(
      "the one with the shorter timeout is cut at its own limit",
      { timeout: shortTimeout, retry: attemptsAfterAStall },
      async (context) => {
        await expect(assertProperty(context, slow, { numRuns: slowRuns })).rejects.toThrow(
          interruption,
        );
      },
    );

    test(
      "the one with the longer timeout runs past the shorter one's limit and passes",
      { timeout: longTimeout },
      async (context) => {
        await assertProperty(context, slow, { numRuns: runsPastTheShortLimit });
      },
    );
  });

  test(
    "a test without a timeout gives its property no time limit",
    { timeout: 0 },
    async (context) => {
      await assertProperty(context, slow, { numRuns: quickRuns });
    },
  );

  test(
    "parameters that would report or interrupt a run by themselves are dropped, however the object reaches the runner",
    { timeout: shortTimeout },
    async (context) => {
      const carried: PropertyParameters<[number]> = Object.assign(
        { numRuns: quickRuns },
        { reporter: () => undefined, asyncReporter: async () => undefined, plugins: [] },
      );
      await expect(
        assertProperty(
          context,
          fc.property(fc.nat(), () => false),
          carried,
        ),
      ).rejects.toThrow(/^Property failed after 1 tests/);
    },
  );
}
