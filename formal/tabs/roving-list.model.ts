import {
  afterClick,
  afterKey,
  firstEnabled,
  isAcross,
  isEnabled,
  isPress,
  type Key,
  type RovingList,
  type Tab,
  tabs,
} from "#/formal/tabs/roving-list.ts";
import { keyboardTable, rowHolds } from "#/formal/tabs/tabs-configs.ts";

let size!: 2 | 3 | 4;
let disabled!: Set<Tab>;
let vertical!: boolean;
let rightToLeft!: boolean;
let loop!: boolean;
let selectsOnMove!: boolean;
let deselects!: boolean;
let selected!: Tab | null;
let focused: Tab | null = null;
let last: Key | "click" | "none" = "none";

function list(): RovingList {
  return { size, disabled, vertical, rightToLeft, loop, selectsOnMove, deselects };
}

/** @initially */
export const isAListOfTabs = () =>
  [...disabled].every((tab) => tab < size) &&
  tabs.some((tab) => isEnabled(list(), tab)) &&
  (selected === null || isEnabled(list(), selected));

export const click = (tab: Tab) => {
  if (!isEnabled(list(), tab)) return;
  const next = afterClick(list(), { selected, focused }, tab);
  selected = next.selected;
  focused = next.focused;
  last = "click";
};

export const press = (key: Key) => {
  if (focused === null) return;
  const next = afterKey(list(), { selected, focused }, key);
  selected = next.selected;
  focused = next.focused;
  last = key;
};

export const focusRestsOnAnEnabledTab = () => focused === null || isEnabled(list(), focused);

export const selectionRestsOnAnEnabledTab = () => selected === null || isEnabled(list(), selected);

export const anArrowSelectsTheTabItFocuses = () =>
  !selectsOnMove || focused === null || selected === null || selected === focused;

export const theTabStopIsAnEnabledTab = () =>
  isEnabled(list(), selected ?? focused ?? firstEnabled(list()));

/** @always */
export const aKeyAcrossTheOrientationChangesNothing = (before: {
  selected: Tab | null;
  focused: Tab | null;
  last: Key | "click" | "none";
}) =>
  last === "click" ||
  last === "none" ||
  !isAcross(list(), last) ||
  (selected === before.selected && focused === before.focused);

/** @always */
export const enterAndSpaceKeepFocus = (before: { focused: Tab | null }) =>
  last === "click" || last === "none" || !isPress(last) || focused === before.focused;

/** @assume */
export const everyRowOfTheKeyboardTableHolds = () => keyboardTable.every(rowHolds);
