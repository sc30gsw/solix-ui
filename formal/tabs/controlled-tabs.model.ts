import {
  destinationOf,
  isEnabled,
  isPress,
  type Key,
  type RovingList,
} from "#/formal/tabs/roving-list.ts";

type Tab = 0 | 1 | 2 | 3;

let size!: 2 | 3 | 4;
let follows!: boolean;
let refused!: Tab | null;
let value!: Tab | null;
let focused: Tab | null = null;
let asked: Tab | undefined = undefined;

function tabAt(index: number): Tab {
  if (index === 0) return 0;
  if (index === 1) return 1;
  if (index === 2) return 2;
  if (index === 3) return 3;
  throw new Error("the roving list gave an index past the fourth tab");
}

function list(): RovingList {
  return {
    size,
    disabled: new Set<number>(),
    vertical: false,
    rightToLeft: false,
    loop: true,
    selectsOnMove: true,
    deselects: false,
  };
}

function ask(tab: Tab) {
  if (tab !== value) asked = tab;
}

function pressOn(tab: Tab) {
  if (tab !== refused) ask(tab);
}

/** @initially */
export const isAControlledList = () =>
  (refused === null || refused < size) && (value === null || isEnabled(list(), value));

export const click = (tab: Tab) => {
  if (asked !== undefined || !isEnabled(list(), tab)) return;
  focused = tab;
  pressOn(tab);
};

export const press = (key: Key) => {
  if (asked !== undefined || focused === null) return;
  if (isPress(key)) {
    pressOn(focused);
  } else {
    const to = tabAt(destinationOf(list(), focused, key));
    if (to === focused) return;
    focused = to;
    ask(to);
  }
};

export const appSelectsNone = () => {
  if (asked !== undefined || !follows || value === null) return;
  value = null;
  focused = null;
};

/** @fair */
export const appHearsTheRequest = () => {
  if (asked === undefined) return;
  if (follows) value = asked;
  asked = undefined;
};

export const focusRestsOnATabOfTheList = () => focused === null || isEnabled(list(), focused);

export const theValueIsATabOfTheList = () => value === null || isEnabled(list(), value);

type Before = { value: Tab | null; focused: Tab | null; asked: Tab | undefined };

/** @always */
export const aHeldListKeepsItsValue = (before: Before) => follows || value === before.value;

/** @always */
export const theValueChangesOnlyAsTheAppDecides = (before: Before) =>
  value === before.value ||
  (before.asked !== undefined && value === before.asked) ||
  (value === null && focused === null && before.asked === undefined);

const isAnswered = () => asked === undefined;

/** @leadsTo isAnswered */
export const theAppHearsEveryRequest = () => !isAnswered();
