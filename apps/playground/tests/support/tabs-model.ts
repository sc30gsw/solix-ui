import type { TabsSetup } from "../../src/sections/tabs-setups.ts";

export const moves = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"] as const;
export const presses = ["Enter", "Space"] as const;
export const keys = [...moves, ...presses];

export type Move = (typeof moves)[number];
export type Key = (typeof keys)[number];
export type TabsModel = { selected: string | null; focused: string | null };

function isMove(key: string): key is Move {
  return moves.some((move) => move === key);
}

function destinationOf(
  { tabs, orientation, direction, loop }: TabsSetup,
  from: number,
  key: Move,
): number {
  const [forward, backward] =
    orientation === "vertical"
      ? ["ArrowDown", "ArrowUp"]
      : direction === "rtl"
        ? ["ArrowLeft", "ArrowRight"]
        : ["ArrowRight", "ArrowLeft"];
  const isEnabled = (index: number) => tabs[index]?.disabled === false;
  if (key === "Home") return tabs.findIndex(({ disabled }) => !disabled);
  if (key === "End") return tabs.findLastIndex(({ disabled }) => !disabled);
  if (key !== forward && key !== backward) return from;
  const step = key === forward ? 1 : -1;
  for (let walked = 1; walked < tabs.length; walked += 1) {
    const reached = from + walked * step;
    const index = loop ? (reached + tabs.length) % tabs.length : reached;
    if (index < 0 || index >= tabs.length) return from;
    if (isEnabled(index)) return index;
  }
  return from;
}

export function afterPressOn(setup: TabsSetup, model: TabsModel, name: string): TabsModel {
  return { selected: setup.deselects && model.selected === name ? null : name, focused: name };
}

export function afterKey(setup: TabsSetup, model: TabsModel, key: string): TabsModel {
  if (model.focused === null) return model;
  if (!isMove(key)) return afterPressOn(setup, model, model.focused);
  const from = setup.tabs.findIndex(({ name }) => name === model.focused);
  const to = setup.tabs[destinationOf(setup, from, key)].name;
  return {
    selected: setup.selectsOnArrow && to !== model.focused ? to : model.selected,
    focused: to,
  };
}

export type Action = { click: string } | { key: Key };

export function afterAction(setup: TabsSetup, model: TabsModel, action: Action): TabsModel {
  return "click" in action
    ? afterPressOn(setup, model, action.click)
    : afterKey(setup, model, action.key);
}

function actionsOn(setup: TabsSetup, model: TabsModel): Action[] {
  return [
    ...setup.tabs.filter(({ disabled }) => !disabled).map(({ name }) => ({ click: name })),
    ...(model.focused === null ? [] : keys.map((key) => ({ key }))),
  ];
}

function sameState(one: TabsModel, other: TabsModel): boolean {
  return one.selected === other.selected && one.focused === other.focused;
}

export function pathBetween(setup: TabsSetup, from: TabsModel, to: TabsModel): Action[] {
  const reached: { state: TabsModel; path: Action[] }[] = [{ state: from, path: [] }];
  for (const { state, path } of reached) {
    if (sameState(state, to)) return path;
    for (const action of actionsOn(setup, state)) {
      const next = afterAction(setup, state, action);
      if (!reached.some((seen) => sameState(seen.state, next))) {
        reached.push({ state: next, path: [...path, action] });
      }
    }
  }
  throw new Error(
    `${setup.list}: no clicks and keys lead from ${JSON.stringify(from)} to ${JSON.stringify(to)}.`,
  );
}

export type SingleStep = { list: string; from: TabsModel; key: Key; to: TabsModel };

export function singleSteps(setup: TabsSetup): SingleStep[] {
  const states: TabsModel[] = [{ selected: setup.initial, focused: null }];
  for (const state of states) {
    for (const action of actionsOn(setup, state)) {
      const next = afterAction(setup, state, action);
      if (!states.some((seen) => sameState(seen, next))) states.push(next);
    }
  }
  return states
    .filter(({ focused }) => focused !== null)
    .flatMap((from) =>
      keys.map((key) => ({ list: setup.list, from, key, to: afterKey(setup, from, key) })),
    );
}
