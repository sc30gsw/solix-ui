import {
  afterKey,
  type Key,
  type RovingList,
  type Selection,
  type Tab,
} from "#/formal/tabs/roving-list.ts";

export type TabsConfig = RovingList & { initial: Tab | null };

export type ControlledConfig = {
  size: number;
  follows: boolean;
  refused: Tab | null;
  value: Tab | null;
};

export type KeyboardRow = {
  list: TabsConfig;
  start: Tab;
  keys: Key[];
  focused: Tab;
  selected: Tab;
};

export const account: TabsConfig = {
  size: 4,
  disabled: new Set<Tab>([1]),
  vertical: false,
  rightToLeft: false,
  loop: true,
  selectsOnMove: true,
  deselects: false,
  initial: 0,
};

export const manual: TabsConfig = {
  size: 3,
  disabled: new Set<Tab>(),
  vertical: true,
  rightToLeft: false,
  loop: false,
  selectsOnMove: false,
  deselects: false,
  initial: 1,
};

export const vertical: TabsConfig = {
  size: 4,
  disabled: new Set<Tab>([3]),
  vertical: true,
  rightToLeft: false,
  loop: true,
  selectsOnMove: true,
  deselects: false,
  initial: 1,
};

export const optional: TabsConfig = {
  size: 4,
  disabled: new Set<Tab>([0, 3]),
  vertical: false,
  rightToLeft: false,
  loop: true,
  selectsOnMove: true,
  deselects: true,
  initial: null,
};

export const rightToLeft: TabsConfig = {
  size: 4,
  disabled: new Set<Tab>([1]),
  vertical: false,
  rightToLeft: true,
  loop: true,
  selectsOnMove: true,
  deselects: false,
  initial: 0,
};

export const tabsConfigs: TabsConfig[] = [account, manual, vertical, optional, rightToLeft];

export const controlledConfig: ControlledConfig = { size: 3, follows: true, refused: 2, value: 1 };

export const heldConfig: ControlledConfig = { size: 4, follows: false, refused: null, value: 0 };

function row(list: TabsConfig, start: Tab, keys: Key[], focused: Tab, selected: Tab): KeyboardRow {
  return { list, start, keys, focused, selected };
}

export const keyboardTable: KeyboardRow[] = [
  row(account, 0, ["ArrowRight"], 2, 2),
  row(account, 2, ["ArrowLeft"], 0, 0),
  row(account, 0, ["ArrowLeft"], 3, 3),
  row(account, 3, ["ArrowRight"], 0, 0),
  row(account, 2, ["Home"], 0, 0),
  row(account, 0, ["End"], 3, 3),
  row(account, 2, ["ArrowDown"], 2, 2),
  row(account, 2, ["ArrowUp"], 2, 2),
  row(account, 0, ["ArrowRight", "ArrowRight"], 3, 3),
  row(rightToLeft, 0, ["ArrowLeft"], 2, 2),
  row(rightToLeft, 2, ["ArrowRight"], 0, 0),
  row(rightToLeft, 0, ["ArrowRight"], 3, 3),
  row(rightToLeft, 3, ["ArrowLeft"], 0, 0),
  row(rightToLeft, 2, ["Home"], 0, 0),
  row(rightToLeft, 2, ["End"], 3, 3),
  row(manual, 1, ["ArrowDown"], 2, 1),
  row(manual, 1, ["ArrowDown", "Enter"], 2, 2),
  row(manual, 1, ["ArrowUp", "Space"], 0, 0),
  row(manual, 2, ["ArrowDown"], 2, 2),
  row(manual, 0, ["ArrowUp"], 0, 0),
  row(manual, 1, ["ArrowRight"], 1, 1),
  row(manual, 1, ["Home"], 0, 1),
  row(manual, 1, ["End"], 2, 1),
  row(vertical, 1, ["ArrowUp"], 0, 0),
  row(vertical, 0, ["ArrowUp"], 2, 2),
  row(vertical, 2, ["ArrowDown"], 0, 0),
  row(vertical, 0, ["ArrowDown"], 1, 1),
  row(vertical, 1, ["ArrowLeft"], 1, 1),
  row(vertical, 0, ["End"], 2, 2),
  row(optional, 2, ["Home"], 1, 1),
  row(optional, 1, ["End"], 2, 2),
  row(optional, 2, ["ArrowRight"], 1, 1),
  row(optional, 1, ["ArrowLeft"], 2, 2),
];

function afterKeys(list: RovingList, state: Selection, keys: Key[], at: number): Selection {
  if (at >= keys.length) return state;
  return afterKeys(list, afterKey(list, state, keys[at]), keys, at + 1);
}

export function rowHolds(row: KeyboardRow): boolean {
  const reached = afterKeys(row.list, { selected: row.start, focused: row.start }, row.keys, 0);
  return reached.selected === row.selected && reached.focused === row.focused;
}
