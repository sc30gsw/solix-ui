import fc from "fast-check";
import type { TestContext } from "vite-plus/test";

const shareOfTheTestTimeout = 0.9;

export type PropertyParameters<Ts> = Pick<
  fc.Parameters<Ts>,
  "numRuns" | "examples" | "seed" | "path" | "endOnFailure" | "verbose"
>;

function waitBeforeARetry({ retry }: TestContext["task"]): number {
  return typeof retry === "object" ? (retry.delay ?? 0) : 0;
}

function attemptStartedAt(task: TestContext["task"]): number {
  const previous = task.result?.attempts?.at(-1);
  if (!previous) return task.result?.startTime ?? Date.now();
  const previousEndedAt = previous.startTime + previous.duration;
  return previous.repeatIndex === task.result?.repeatCount
    ? previousEndedAt + waitBeforeARetry(task)
    : previousEndedAt;
}

function timeLimit({ task }: TestContext): fc.Plugin<unknown>[] {
  if (!Number.isFinite(task.timeout) || task.timeout <= 0) return [];
  const runsOutAt = attemptStartedAt(task) + task.timeout * shareOfTheTestTimeout;
  return [fc.interruptAfterTimeLimit(runsOutAt - Date.now(), { failOnInterrupt: true })];
}

type Tracked<Ts> = { property: fc.IRawProperty<Ts>; runsEnded: () => Promise<void> };

function isPending(outcome: unknown): outcome is PromiseLike<unknown> {
  return typeof outcome === "object" && outcome !== null && "then" in outcome;
}

function trackingItsRuns<Ts>(property: fc.IRawProperty<Ts>): Tracked<Ts> {
  const going = new Set<PromiseLike<unknown>>();
  return {
    property: {
      isAsync: () => property.isAsync(),
      generate: (random, runId) => property.generate(random, runId),
      shrink: (value) => property.shrink(value),
      run: (value) => {
        const outcome = property.run(value);
        if (isPending(outcome)) {
          going.add(outcome);
          const ended = () => going.delete(outcome);
          outcome.then(ended, ended);
        }
        return outcome;
      },
      runBeforeEach: () => property.runBeforeEach(),
      runAfterEach: () => property.runAfterEach(),
    },
    runsEnded: async () => {
      await Promise.allSettled(going);
    },
  };
}

export async function assertProperty<Ts>(
  context: TestContext,
  property: fc.IRawProperty<Ts>,
  { numRuns, examples, seed, path, endOnFailure, verbose }: PropertyParameters<Ts> = {},
): Promise<void> {
  const tracked = trackingItsRuns(property);
  try {
    await fc.assert(tracked.property, {
      ...(numRuns === undefined ? {} : { numRuns }),
      ...(examples === undefined ? {} : { examples }),
      ...(seed === undefined ? {} : { seed }),
      ...(path === undefined ? {} : { path }),
      ...(endOnFailure === undefined ? {} : { endOnFailure }),
      ...(verbose === undefined ? {} : { verbose }),
      plugins: timeLimit(context),
    });
  } finally {
    await tracked.runsEnded();
  }
}
