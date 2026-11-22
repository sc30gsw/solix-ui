import fc from "fast-check";
import type { TestContext } from "vite-plus/test";
import { seedFrom, seedOfThisRun } from "#/tests/support/property-seed.ts";

const shareOfTheTestTimeout = 0.9;
const shareBeforeTheTestTimesOut = 0.97;

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

function limitAt(task: TestContext["task"], share: number): number | undefined {
  if (!Number.isFinite(task.timeout) || task.timeout <= 0) return undefined;
  return attemptStartedAt(task) + task.timeout * share;
}

function timeLimit({ task }: TestContext): fc.Plugin<unknown>[] {
  const runsOutAt = limitAt(task, shareOfTheTestTimeout);
  if (runsOutAt === undefined) return [];
  return [fc.interruptAfterTimeLimit(runsOutAt - Date.now(), { failOnInterrupt: true })];
}

type Attempt = { key: string; going: Set<PromiseLike<unknown>> };

const attempts = new WeakMap<TestContext["task"], Attempt>();

function attemptKey({ result }: TestContext["task"]): string {
  return `${result?.repeatCount ?? 0}:${result?.attempts?.length ?? 0}`;
}

function runsOfThisAttempt(task: TestContext["task"]): Set<PromiseLike<unknown>> | undefined {
  const attempt = attempts.get(task);
  return attempt?.key === attemptKey(task) ? attempt.going : undefined;
}

export function propertyRunsGoing(task: TestContext["task"]): number {
  return runsOfThisAttempt(task)?.size ?? 0;
}

function isPending(outcome: unknown): outcome is PromiseLike<unknown> {
  return typeof outcome === "object" && outcome !== null && "then" in outcome;
}

function tracksEachRun({ task }: TestContext): fc.Plugin<unknown> {
  const going = runsOfThisAttempt(task) ?? new Set<PromiseLike<unknown>>();
  attempts.set(task, { key: attemptKey(task), going });
  return () => ({
    decorateRun: (nestedRun) => (value) => {
      const outcome = nestedRun(value);
      if (isPending(outcome)) {
        going.add(outcome);
        const ended = () => going.delete(outcome);
        outcome.then(ended, ended);
      }
      return outcome;
    },
  });
}

function timeLeftUntil(endsAt: number): { elapsed: Promise<void>; cancel: () => void } {
  const elapsed = Promise.withResolvers<void>();
  const pending = setTimeout(elapsed.resolve, Math.max(0, endsAt - Date.now()));
  return { elapsed: elapsed.promise, cancel: () => clearTimeout(pending) };
}

async function runsEnded({ task }: TestContext): Promise<number> {
  const going = runsOfThisAttempt(task);
  if (going === undefined) return 0;
  const waitedFor = limitAt(task, shareBeforeTheTestTimesOut);
  if (waitedFor === undefined) {
    await Promise.allSettled(going);
    return going.size;
  }
  const timeLeft = timeLeftUntil(waitedFor);
  await Promise.race([Promise.allSettled(going), timeLeft.elapsed]);
  timeLeft.cancel();
  return going.size;
}

function withTheRunsStillGoing(failure: unknown, going: number): unknown {
  if (going === 0) return failure;
  const runs = going === 1 ? "1 run of the property was" : `${going} runs of the property were`;
  const message = failure instanceof Error ? failure.message : String(failure);
  return new Error(
    `${message}\n${runs} still going when the test's time ran out, and may still act on the page.`,
    { cause: failure },
  );
}

export async function assertProperty<Ts>(
  context: TestContext,
  property: fc.IRawProperty<Ts>,
  { numRuns, examples, seed, path, endOnFailure, verbose }: PropertyParameters<Ts> = {},
): Promise<void> {
  const fixedSeed = seed ?? seedFrom(seedOfThisRun());
  try {
    await fc.assert(property, {
      ...(numRuns === undefined ? {} : { numRuns }),
      ...(examples === undefined ? {} : { examples }),
      ...(fixedSeed === undefined ? {} : { seed: fixedSeed }),
      ...(path === undefined ? {} : { path }),
      ...(endOnFailure === undefined ? {} : { endOnFailure }),
      ...(verbose === undefined ? {} : { verbose }),
      plugins: [...timeLimit(context), tracksEachRun(context)],
    });
  } catch (failure) {
    throw withTheRunsStillGoing(failure, await runsEnded(context));
  }
}
