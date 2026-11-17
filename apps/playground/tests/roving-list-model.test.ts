import { expect, test } from "vite-plus/test";
import { keyboardTable, tabLists } from "#/tests/support/tabs.ts";
import { afterKey, type RovingListState, singleSteps } from "#/tests/support/roving-list-model.ts";

function listNamed(name: string) {
  const list = tabLists.find((candidate) => candidate.name === name);
  if (!list) throw new Error(`${name}: \`tabsSetups\` has no list with this name.`);
  return list;
}

test.each(keyboardTable)(
  "the roving-list model agrees with the keyboard table: in $list, from $start, after the keys $keys $selected is selected and focus is on $focused",
  ({ list: name, start, keys, focused, selected }) => {
    const list = listNamed(name);
    const started: RovingListState = { selected: start, focused: start };

    expect(
      singleSteps(list).map(({ from }) => from),
      "the row starts from a state the model can reach",
    ).toContainEqual(started);
    expect(keys.reduce((state, key) => afterKey(list, state, key), started)).toEqual({
      selected,
      focused,
    });
  },
);

test("the keyboard table has a row for every list of tabs the playground renders from its setups", () => {
  expect([...new Set(keyboardTable.map(({ list }) => list))].sort()).toEqual(
    tabLists.map(({ name }) => name).sort(),
  );
});
