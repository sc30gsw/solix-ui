import {
  afterClick,
  afterKey,
  isAcross,
  isEnabled,
  isPress,
  type Key,
  type RovingList,
  type Selection,
  tabStopOf,
} from "#/formal/tabs/roving-list.ts";
import { type Size, type Tab, tabAt, tabs } from "#/formal/tabs/tab.ts";

type Last = Key | "click" | "clickDisabled" | "none";

let size!: Size;
let disabled!: Set<Tab>;
let vertical!: boolean;
let rightToLeft!: boolean;
let loop!: boolean;
let selectsOnMove!: boolean;
let deselects!: boolean;
let selected!: Tab | null;
let focused: Tab | null = null;
let last: Last = "none";

function list(): RovingList {
  return { size, disabled, vertical, rightToLeft, loop, selectsOnMove, deselects };
}

function become(next: Selection, action: Last) {
  selected = next.selected === null ? null : tabAt(next.selected);
  focused = next.focused === null ? null : tabAt(next.focused);
  last = action;
}

/** @initially */
export const isAListOfTabs = () =>
  [...disabled].every((tab) => tab < size) &&
  tabs.some((tab) => isEnabled(list(), tab)) &&
  (selected === null || isEnabled(list(), selected));

export const click = (tab: Tab) => {
  if (!isEnabled(list(), tab)) return;
  become(afterClick(list(), { selected, focused }, tab), "click");
};

export const clickDisabled = (tab: Tab) => {
  if (tab >= size || !disabled.has(tab)) return;
  last = "clickDisabled";
};

export const press = (key: Key) => {
  if (focused === null) return;
  become(afterKey(list(), { selected, focused }, key), key);
};

export const focusRestsOnAnEnabledTab = () => focused === null || isEnabled(list(), focused);

export const selectionRestsOnAnEnabledTab = () => selected === null || isEnabled(list(), selected);

export const anArrowSelectsTheTabItFocuses = () =>
  !selectsOnMove || focused === null || selected === null || selected === focused;

export const theTabStopIsAnEnabledTab = () =>
  isEnabled(list(), tabStopOf(list(), { selected, focused }));

/** @always */
export const aKeyAcrossTheOrientationChangesNothing = (before: Selection) =>
  last === "click" ||
  last === "clickDisabled" ||
  last === "none" ||
  !isAcross(list(), last) ||
  (selected === before.selected && focused === before.focused);

/** @always */
export const enterAndSpaceKeepFocus = (before: Selection) =>
  last === "click" ||
  last === "clickDisabled" ||
  last === "none" ||
  !isPress(last) ||
  focused === before.focused;

/** @always */
export const aClickOnADisabledTabChangesNothing = (before: Selection) =>
  last !== "clickDisabled" || (selected === before.selected && focused === before.focused);
