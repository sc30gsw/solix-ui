import fc from "fast-check";
import type { TestContext } from "vite-plus/test";

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

const runsGoing = new WeakMap<TestContext["task"], Set<PromiseLike<unknown>>>();

function goingIn(task: TestContext["task"]): Set<PromiseLike<unknown>> {
  const going = runsGoing.get(task) ?? new Set<PromiseLike<unknown>>();
  runsGoing.set(task, going);
  return going;
}

export function propertyRunsGoing(task: TestContext["task"]): number {
  return runsGoing.get(task)?.size ?? 0;
}

function isPending(outcome: unknown): outcome is PromiseLike<unknown> {
  return typeof outcome === "object" && outcome !== null && "then" in outcome;
}

function tracksEachRun({ task }: TestContext): fc.Plugin<unknown> {
  const going = goingIn(task);
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

async function runsEnded({ task }: TestContext): Promise<number> {
  const going = goingIn(task);
  const waitedFor = limitAt(task, shareBeforeTheTestTimesOut);
  const timer: { pending?: ReturnType<typeof setTimeout> } = {};
  const timeLeft = new Promise<void>((resolve) => {
    if (waitedFor !== undefined) {
      timer.pending = setTimeout(resolve, Math.max(0, waitedFor - Date.now()));
    }
  });
  await Promise.race([Promise.allSettled(going), timeLeft]);
  clearTimeout(timer.pending);
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
  try {
    await fc.assert(property, {
      ...(numRuns === undefined ? {} : { numRuns }),
      ...(examples === undefined ? {} : { examples }),
      ...(seed === undefined ? {} : { seed }),
      ...(path === undefined ? {} : { path }),
      ...(endOnFailure === undefined ? {} : { endOnFailure }),
      ...(verbose === undefined ? {} : { verbose }),
      plugins: [...timeLimit(context), tracksEachRun(context)],
    });
  } catch (failure) {
    throw withTheRunsStillGoing(failure, await runsEnded(context));
  }
}
