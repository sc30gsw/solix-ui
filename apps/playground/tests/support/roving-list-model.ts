export const moves = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"] as const;
export const presses = ["Enter", "Space"] as const;
export const keys = [...moves, ...presses];

export type Move = (typeof moves)[number];
export type Key = (typeof keys)[number];

export type RovingItem = { readonly name: string; readonly disabled: boolean };

export type RovingList = {
  readonly name: string;
  readonly items: readonly RovingItem[];
  readonly orientation: "horizontal" | "vertical";
  readonly direction: "ltr" | "rtl";
  readonly loop: boolean;
  readonly selectsOnMove: boolean;
  readonly deselects: boolean;
  readonly initial: string | null;
};

export type RovingListState = { selected: string | null; focused: string | null };

function isMove(key: string): key is Move {
  return moves.some((move) => move === key);
}

function destinationOf(
  { items, orientation, direction, loop }: RovingList,
  from: number,
  key: Move,
): number {
  const [forward, backward] =
    orientation === "vertical"
      ? ["ArrowDown", "ArrowUp"]
      : direction === "rtl"
        ? ["ArrowLeft", "ArrowRight"]
        : ["ArrowRight", "ArrowLeft"];
  const isEnabled = (index: number) => items[index]?.disabled === false;
  if (key === "Home") return items.findIndex(({ disabled }) => !disabled);
  if (key === "End") return items.findLastIndex(({ disabled }) => !disabled);
  if (key !== forward && key !== backward) return from;
  const step = key === forward ? 1 : -1;
  for (let walked = 1; walked < items.length; walked += 1) {
    const reached = from + walked * step;
    const index = loop ? (reached + items.length) % items.length : reached;
    if (index < 0 || index >= items.length) return from;
    if (isEnabled(index)) return index;
  }
  return from;
}

export function afterPressOn(
  list: RovingList,
  state: RovingListState,
  name: string,
): RovingListState {
  return { selected: list.deselects && state.selected === name ? null : name, focused: name };
}

export function afterKey(list: RovingList, state: RovingListState, key: string): RovingListState {
  if (state.focused === null) return state;
  if (!isMove(key)) return afterPressOn(list, state, state.focused);
  const from = list.items.findIndex(({ name }) => name === state.focused);
  const to = list.items[destinationOf(list, from, key)].name;
  return {
    selected: list.selectsOnMove && to !== state.focused ? to : state.selected,
    focused: to,
  };
}

export type Action = { click: string } | { key: Key };

export function afterAction(
  list: RovingList,
  state: RovingListState,
  action: Action,
): RovingListState {
  return "click" in action
    ? afterPressOn(list, state, action.click)
    : afterKey(list, state, action.key);
}

function actionsOn(list: RovingList, state: RovingListState): Action[] {
  return [
    ...list.items.filter(({ disabled }) => !disabled).map(({ name }) => ({ click: name })),
    ...(state.focused === null ? [] : keys.map((key) => ({ key }))),
  ];
}

function sameState(one: RovingListState, other: RovingListState): boolean {
  return one.selected === other.selected && one.focused === other.focused;
}

export function pathBetween(
  list: RovingList,
  from: RovingListState,
  to: RovingListState,
): Action[] {
  const reached: { state: RovingListState; path: Action[] }[] = [{ state: from, path: [] }];
  for (const { state, path } of reached) {
    if (sameState(state, to)) return path;
    for (const action of actionsOn(list, state)) {
      const next = afterAction(list, state, action);
      if (!reached.some((seen) => sameState(seen.state, next))) {
        reached.push({ state: next, path: [...path, action] });
      }
    }
  }
  throw new Error(
    `${list.name}: no clicks and keys lead from ${JSON.stringify(from)} to ${JSON.stringify(to)}.`,
  );
}

export type SingleStep = {
  list: RovingList;
  from: RovingListState;
  key: Key;
  to: RovingListState;
};

export function singleSteps(list: RovingList): SingleStep[] {
  const states: RovingListState[] = [{ selected: list.initial, focused: null }];
  for (const state of states) {
    for (const action of actionsOn(list, state)) {
      const next = afterAction(list, state, action);
      if (!states.some((seen) => sameState(seen, next))) states.push(next);
    }
  }
  return states
    .filter(({ focused }) => focused !== null)
    .flatMap((from) => keys.map((key) => ({ list, from, key, to: afterKey(list, from, key) })));
}
