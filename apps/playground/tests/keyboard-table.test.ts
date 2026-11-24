import { expect, test } from "vite-plus/test";
import { keys } from "#/tests/support/formal.ts";
import {
  afterKeyByName,
  keyboardTable,
  namedLists,
  type NamedSelection,
  tabsSetups,
} from "#/tests/support/tabs.ts";

function listNamed(name: string) {
  const list = namedLists.find((candidate) => candidate.name === name);
  if (!list) throw new Error(`${name}: \`tabsSetups\` has no list with this name.`);
  return list;
}

function keyNamed(name: string) {
  const key = keys.find((each) => each === name);
  if (key === undefined) throw new Error(`${name} is no key the roving list takes.`);
  return key;
}

test.each(keyboardTable)(
  "the roving list that formal/tabs/roving-list.ts specifies agrees with the keyboard table: in $list, from $start, after the keys $keys $selected is selected and focus is on $focused",
  ({ list: name, start, keys: pressed, focused, selected }) => {
    const list = listNamed(name);
    const started: NamedSelection = { selected: start, focused: start };

    expect(
      list.list.disabled.has(list.names.indexOf(start)) || !list.names.includes(start),
      "the row starts on an enabled tab of its list",
    ).toBe(false);
    expect(
      pressed.reduce((state, key) => afterKeyByName(list, state, keyNamed(key)), started),
    ).toEqual({ selected, focused });
  },
);

test("the keyboard table has rows for every list of tabs the playground renders from its setups, and for no other", () => {
  expect([...new Set(keyboardTable.map(({ list }) => list))].sort()).toEqual(
    tabsSetups.map(({ list }) => list).sort(),
  );
});
