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

export async function assertProperty<Ts>(
  context: TestContext,
  property: fc.IRawProperty<Ts>,
  { numRuns, examples, seed, path, endOnFailure, verbose }: PropertyParameters<Ts> = {},
): Promise<void> {
  await fc.assert(property, {
    ...(numRuns === undefined ? {} : { numRuns }),
    ...(examples === undefined ? {} : { examples }),
    ...(seed === undefined ? {} : { seed }),
    ...(path === undefined ? {} : { path }),
    ...(endOnFailure === undefined ? {} : { endOnFailure }),
    ...(verbose === undefined ? {} : { verbose }),
    plugins: timeLimit(context),
  });
}
