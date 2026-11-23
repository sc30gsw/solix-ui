import {
  destinationOf,
  isEnabled,
  isPress,
  type Key,
  type RovingList,
  type Tab,
  tabAt,
} from "#/formal/tabs/roving-list.ts";

let size!: 2 | 3 | 4;
let follows!: boolean;
let refused!: Tab | null;
let value!: Tab | null;
let focused: Tab | null = null;
let asked: Tab | undefined = undefined;
let requests: 0 | 1 | 2 = 0;

function list(): RovingList {
  return {
    size,
    disabled: new Set<Tab>(),
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

/** @initially */
export const isAControlledList = () =>
  (refused === null || refused < size) && (value === null || isEnabled(list(), value));

export const click = (tab: Tab) => {
  if (asked !== undefined || !isEnabled(list(), tab) || tab === refused) return;
  focused = tab;
  ask(tab);
};

export const press = (key: Key) => {
  if (asked !== undefined || focused === null) return;
  if (isPress(key)) {
    ask(focused);
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
  requests = requests === 0 ? 1 : 2;
  if (follows) value = asked;
  asked = undefined;
};

export const focusRestsOnATabOfTheList = () => focused === null || isEnabled(list(), focused);

export const theValueIsATabOfTheList = () => value === null || isEnabled(list(), value);

/** @always */
export const aHeldListKeepsItsValue = (before: { value: Tab | null }) =>
  follows || value === before.value;

/** @always */
export const theValueChangesOnlyAsTheAppDecides = (before: {
  value: Tab | null;
  asked: Tab | undefined;
}) => value === before.value || value === null || value === before.asked;

const isAnswered = () => asked === undefined;

/** @leadsTo isAnswered */
export const theAppHearsEveryRequest = () => !isAnswered();
