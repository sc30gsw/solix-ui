import type { TabsOrientation } from "./tabs-context";

const tab = '[role="tab"]';

type Travel = { start: (from: number, count: number) => number; step: 1 | -1; wraps: boolean };

function travelFor(
  key: string,
  orientation: TabsOrientation,
  rightToLeft: boolean,
  loop: boolean,
): Travel | undefined {
  const [forward, backward] =
    orientation === "vertical"
      ? ["ArrowDown", "ArrowUp"]
      : rightToLeft
        ? ["ArrowLeft", "ArrowRight"]
        : ["ArrowRight", "ArrowLeft"];
  if (key === forward) return { start: (from) => from + 1, step: 1, wraps: loop };
  if (key === backward) return { start: (from) => from - 1, step: -1, wraps: loop };
  if (key === "Home") return { start: () => 0, step: 1, wraps: false };
  if (key === "End") return { start: (_, count) => count - 1, step: -1, wraps: false };
  return undefined;
}

function isEnabled(element: HTMLElement): boolean {
  return !element.matches(":disabled");
}

/**
 * The SDK keeps a disabled tab focusable and moves focus onto it. This moves past it first, the way
 * the key points, and prevents the default so the SDK leaves the key alone.
 */
export function stepOverDisabledTabs(
  event: KeyboardEvent & { currentTarget: HTMLElement },
  options: { orientation: TabsOrientation; loop: boolean; selects: boolean },
): void {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const list = event.currentTarget;
  const tabs = [...list.querySelectorAll<HTMLElement>(tab)];
  const from = tabs.findIndex((candidate) => candidate === event.target);
  const travel = travelFor(
    event.key,
    options.orientation,
    getComputedStyle(list).direction === "rtl",
    options.loop,
  );
  if (from === -1 || travel === undefined) return;
  const within = (index: number) => (travel.wraps ? (index + tabs.length) % tabs.length : index);
  const first = within(travel.start(from, tabs.length));
  if (tabs[first] === undefined || isEnabled(tabs[first])) return;
  event.preventDefault();
  for (let steps = 1; steps < tabs.length; steps += 1) {
    const next = tabs[within(first + steps * travel.step)];
    if (next === undefined || next === tabs[from]) return;
    if (!isEnabled(next)) continue;
    next.focus();
    if (options.selects && next.getAttribute("aria-selected") !== "true") next.click();
    return;
  }
}
