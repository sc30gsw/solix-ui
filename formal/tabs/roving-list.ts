export type Tab = 0 | 1 | 2 | 3;
export type Move = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End";
export type Press = "Enter" | "Space";
export type Key = Move | Press;

export type RovingList = {
  size: number;
  disabled: Set<Tab>;
  vertical: boolean;
  rightToLeft: boolean;
  loop: boolean;
  selectsOnMove: boolean;
  deselects: boolean;
};

export type Selection = { selected: Tab | null; focused: Tab | null };

export const tabs: Tab[] = [0, 1, 2, 3];

export function isEnabled(list: RovingList, index: number): boolean {
  return tabs.some((tab) => tab === index && tab < list.size && !list.disabled.has(tab));
}

function enabledFrom(list: RovingList, index: number, by: number): number {
  if (index < 0 || index >= list.size) return -1;
  if (isEnabled(list, index)) return index;
  return enabledFrom(list, index + by, by);
}

export function firstEnabled(list: RovingList): number {
  return enabledFrom(list, 0, 1);
}

export function lastEnabled(list: RovingList): number {
  return enabledFrom(list, list.size - 1, -1);
}

function walk(list: RovingList, from: number, by: number, walked: number): number {
  if (walked >= list.size) return from;
  const reached = from + walked * by;
  const index = list.loop ? (reached + list.size) % list.size : reached;
  if (index < 0 || index >= list.size) return from;
  if (isEnabled(list, index)) return index;
  return walk(list, from, by, walked + 1);
}

export function forwardKey(list: RovingList): Move {
  if (list.vertical) return "ArrowDown";
  return list.rightToLeft ? "ArrowLeft" : "ArrowRight";
}

export function backwardKey(list: RovingList): Move {
  if (list.vertical) return "ArrowUp";
  return list.rightToLeft ? "ArrowRight" : "ArrowLeft";
}

export function isAcross(list: RovingList, key: Key): boolean {
  return list.vertical
    ? key === "ArrowLeft" || key === "ArrowRight"
    : key === "ArrowUp" || key === "ArrowDown";
}

export function isPress(key: Key): key is Press {
  return key === "Enter" || key === "Space";
}

export function destinationOf(list: RovingList, from: number, key: Move): number {
  if (key === "Home") return firstEnabled(list);
  if (key === "End") return lastEnabled(list);
  if (key === forwardKey(list)) return walk(list, from, 1, 1);
  if (key === backwardKey(list)) return walk(list, from, -1, 1);
  return from;
}

export function tabAt(index: number): Tab {
  if (index === 1) return 1;
  if (index === 2) return 2;
  return index === 3 ? 3 : 0;
}

export function afterClick(list: RovingList, state: Selection, tab: Tab): Selection {
  return { selected: list.deselects && state.selected === tab ? null : tab, focused: tab };
}

export function afterKey(list: RovingList, state: Selection, key: Key): Selection {
  if (state.focused === null) return state;
  if (key === "Enter" || key === "Space") return afterClick(list, state, state.focused);
  const to = tabAt(destinationOf(list, state.focused, key));
  return {
    selected: list.selectsOnMove && to !== state.focused ? to : state.selected,
    focused: to,
  };
}
