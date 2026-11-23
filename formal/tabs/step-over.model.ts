import { type RovingStep, stepPastDisabled } from "#/packages/core/src/roving-step.ts";
import {
  backwardKey,
  destinationOf,
  forwardKey,
  isEnabled,
  type Move,
  type RovingList,
  type Tab,
  tabs,
} from "#/formal/tabs/roving-list.ts";

let size!: 2 | 3 | 4;
let disabled!: Set<Tab>;
let vertical!: boolean;
let rightToLeft!: boolean;
let loop!: boolean;
let from!: Tab;
let key!: Move;
let stepped: RovingStep | null = null;

function list(): RovingList {
  return {
    size,
    disabled,
    vertical,
    rightToLeft,
    loop,
    selectsOnMove: true,
    deselects: false,
  };
}

function disabledFlags(): boolean[] {
  return Array.from({ length: size }, (_, index) => disabled.has(tabs[index]));
}

function sdkStep(): number {
  const count = size;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  const by = key === forwardKey(list()) ? 1 : key === backwardKey(list()) ? -1 : 0;
  if (by === 0) return from;
  const next = from + by;
  return loop ? ((next % count) + count) % count : Math.max(0, Math.min(count - 1, next));
}

function composedStep(step: RovingStep): number {
  return step.handled ? step.to : sdkStep();
}

/** @initially */
export const isAListAndAnEnabledTab = () =>
  [...disabled].every((tab) => tab < size) && isEnabled(list(), from);

export const pressTheKey = () => {
  if (stepped !== null) return;
  stepped = stepPastDisabled(disabledFlags(), from, key, { vertical, rightToLeft, loop });
};

export const theKeyMovesFocusWhereTheRovingListSays = () =>
  stepped === null || composedStep(stepped) === destinationOf(list(), from, key);

export const theSdkIsLeftOnlyKeysThatPointAtAnEnabledTab = () =>
  stepped === null || stepped.handled || sdkStep() === from || isEnabled(list(), sdkStep());

/** @terminating */
export const hasStepped = () => stepped !== null;
