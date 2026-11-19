import { expect, test } from "vite-plus/test";

const timerInterval = 50;
const stallAfter = 300;
const workerSource = `setInterval(() => postMessage(Date.now()), ${timerInterval});`;

type Gap = { from: number; to: number };
type Channel = { ticks: number; longestGap: number };
type Sample = { visibility: string; focused: boolean; frameVisibility: string };

function longestGapIn(stamps: number[], { from, to }: Gap): Channel {
  const inside = stamps.filter((stamp) => stamp > from && stamp < to);
  const edges = [from, ...inside, to];
  const gaps = edges.slice(1).map((edge, index) => edge - edges[index]);
  return { ticks: inside.length, longestGap: Math.round(Math.max(...gaps)) };
}

function longestGapOf(stamps: number[]): number {
  const gaps = stamps.slice(1).map((stamp, index) => stamp - stamps[index]);
  return Math.round(Math.max(0, ...gaps));
}

function sample(): Sample {
  return {
    visibility: window.top?.document.visibilityState ?? "none",
    focused: window.top?.document.hasFocus() ?? false,
    frameVisibility: document.visibilityState,
  };
}

export function observeStalls(): void {
  const startedAt = performance.now();
  const timerStamps: number[] = [];
  const frameStamps: number[] = [];
  const messageStamps: number[] = [];
  const workerClock: number[] = [];
  const changes: string[] = [];
  const state = { running: true, last: JSON.stringify(sample()) };
  const since = (): number => performance.now() - startedAt;

  const worker = new Worker(
    URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" })),
  );
  worker.addEventListener("message", (event: MessageEvent<number>) => {
    messageStamps.push(since());
    workerClock.push(event.data);
  });

  function onTimer(): void {
    timerStamps.push(since());
    const now = JSON.stringify(sample());
    if (now !== state.last) {
      changes.push(`${Math.round(since())}: ${now}`);
      state.last = now;
    }
    if (state.running) setTimeout(onTimer, timerInterval);
  }
  function onFrame(): void {
    frameStamps.push(since());
    if (state.running) requestAnimationFrame(onFrame);
  }
  setTimeout(onTimer, timerInterval);
  requestAnimationFrame(onFrame);

  test("an observation of what stood still while a timer was late", async (context) => {
    state.running = false;
    worker.terminate();
    const stalls = timerStamps
      .slice(1)
      .map((to, index) => ({ from: timerStamps[index], to }))
      .filter(({ from, to }) => to - from > stallAfter)
      .map((gap) => ({
        at: Math.round(gap.from),
        timerGap: Math.round(gap.to - gap.from),
        messages: longestGapIn(messageStamps, gap),
        frames: longestGapIn(frameStamps, gap),
      }));
    const observed = JSON.stringify({
      agent: navigator.userAgent,
      cores: navigator.hardwareConcurrency,
      ran: Math.round(since()),
      first: state.last,
      changes,
      longest: {
        timer: longestGapOf(timerStamps),
        message: longestGapOf(messageStamps),
        workerClock: longestGapOf(workerClock),
        frame: longestGapOf(frameStamps),
      },
      stalls,
    });
    await context.annotate(observed);
    expect(stalls, `stall probe: ${observed}`).toEqual([]);
  });
}
