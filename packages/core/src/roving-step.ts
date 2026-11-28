type RovingLayout = { vertical: boolean; rightToLeft: boolean; loop: boolean };

export type RovingStep = { handled: boolean; to: number };

type Walk = { first: number; by: number; wraps: boolean };

function walkOf(key: string, from: number, count: number, layout: RovingLayout): Walk {
  const forward = layout.vertical ? "ArrowDown" : layout.rightToLeft ? "ArrowLeft" : "ArrowRight";
  const backward = layout.vertical ? "ArrowUp" : layout.rightToLeft ? "ArrowRight" : "ArrowLeft";
  if (key === forward) return { first: from + 1, by: 1, wraps: layout.loop };
  if (key === backward) return { first: from - 1, by: -1, wraps: layout.loop };
  if (key === "Home") return { first: 0, by: 1, wraps: false };
  if (key === "End") return { first: count - 1, by: -1, wraps: false };
  return { first: from, by: 0, wraps: false };
}

function indexOf(walk: Walk, walked: number, count: number): number {
  const reached = walk.first + walked * walk.by;
  return walk.wraps ? (reached + count) % count : reached;
}

function isDisabledAt(disabled: readonly boolean[], index: number): boolean {
  return index >= 0 && index < disabled.length && disabled[index];
}

function walkPast(disabled: readonly boolean[], from: number, walk: Walk, walked: number): number {
  if (walked >= disabled.length) return from;
  const index = indexOf(walk, walked, disabled.length);
  if (index < 0 || index >= disabled.length || index === from) return from;
  if (disabled[index]) return walkPast(disabled, from, walk, walked + 1);
  return index;
}

export function stepPastDisabled(
  disabled: readonly boolean[],
  from: number,
  key: string,
  layout: RovingLayout,
): RovingStep {
  const walk = walkOf(key, from, disabled.length, layout);
  if (walk.by === 0 || !isDisabledAt(disabled, indexOf(walk, 0, disabled.length))) {
    return { handled: false, to: from };
  }
  return { handled: true, to: walkPast(disabled, from, walk, 1) };
}
