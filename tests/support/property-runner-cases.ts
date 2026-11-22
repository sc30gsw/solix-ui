import fc from "fast-check";
import { describe, expect, test } from "vite-plus/test";
import {
  assertProperty,
  propertyRunsGoing,
  type PropertyParameters,
} from "#/tests/support/properties.ts";
import {
  seedFrom,
  seedNotice,
  seedOfThisRun,
  seedVariable,
} from "#/tests/support/property-seed.ts";

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
const stillGoing =
  /^Property interrupted after \d+ tests\n\{ seed: -?\d+ \}[\s\S]*\n1 run of the property was still going when the test's time ran out/;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const leftHanging = Promise.withResolvers<void>();
const countedInTheFirstAttempt: number[] = [];

const slow = fc.asyncProperty(fc.nat(), async () => {
  await delay(runTime);
});

export function definePropertyRunnerTests(): void {
  test(`the run gives every test ${seedVariable} as a string, and assertProperty reads it as the seed of each property that names none`, () => {
    expect(typeof seedOfThisRun()).toBe("string");
    expect([seedFrom(""), seedFrom(undefined), seedFrom("42"), seedFrom(" -7 ")]).toEqual([
      undefined,
      undefined,
      42,
      -7,
    ]);
    expect(() => seedFrom("4.2")).toThrow(`${seedVariable} is "4.2"`);
    expect([seedNotice(""), seedNotice(undefined)]).toEqual([undefined, undefined]);
    expect(seedNotice("42")).toContain("every generated property of this run draws from seed 42");
  });

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
    "a run still going when the time runs out ends before the property fails, so it cannot reach the next test",
    { timeout: shortTimeout, retry: attemptsAfterAStall },
    async (context) => {
      const runs = { going: 0 };
      const counted = fc.asyncProperty(fc.nat(), async () => {
        runs.going += 1;
        await delay(runTime);
        runs.going -= 1;
      });

      await expect(assertProperty(context, counted, { numRuns: slowRuns })).rejects.toThrow(
        interruption,
      );
      expect(runs.going, "runs still going once the property failed").toBe(0);
    },
  );

  test(
    "a run still going when the time runs out ends with the property's own hooks, its afterEach included, before the property fails",
    { timeout: shortTimeout, retry: attemptsAfterAStall },
    async (context) => {
      const hooks = { going: 0 };
      const hooked = fc
        .asyncProperty(fc.nat(), async () => {
          await delay(runTime);
        })
        .beforeEach(async (previous) => {
          hooks.going += 1;
          await previous();
        })
        .afterEach(async (previous) => {
          await delay(runTime);
          await previous();
          hooks.going -= 1;
        });

      await expect(assertProperty(context, hooked, { numRuns: slowRuns })).rejects.toThrow(
        interruption,
      );
      expect(hooks.going, "runs whose hooks were still going once the property failed").toBe(0);
    },
  );

  test(
    "a run that never ends fails the property with its seed and the count of runs still going, before the test's timeout",
    { timeout: shortTimeout, retry: attemptsAfterAStall },
    async (context) => {
      const hang = Promise.withResolvers<void>();
      const hanging = fc.asyncProperty(fc.nat(), async () => {
        await hang.promise;
      });

      await expect(assertProperty(context, hanging)).rejects.toThrow(stillGoing);
      hang.resolve();
      await hang.promise;
    },
  );

  test(
    "an attempt counts the run it leaves going, and a retry counts only its own runs, so that run is not counted again",
    { timeout: shortTimeout, retry: { count: 1 } },
    async (context) => {
      const attemptsBefore = context.task.result?.attempts?.length ?? 0;
      if (attemptsBefore === 0) {
        const hanging = fc.asyncProperty(fc.nat(), async () => {
          await leftHanging.promise;
        });
        await expect(assertProperty(context, hanging)).rejects.toThrow(stillGoing);
        countedInTheFirstAttempt.push(propertyRunsGoing(context.task));
        throw new Error("The first attempt leaves a run going and fails, so the test is retried.");
      }
      expect(countedInTheFirstAttempt, "runs the first attempt counted").toEqual([1]);
      expect(propertyRunsGoing(context.task), "runs this attempt started").toBe(0);
      leftHanging.resolve();
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
