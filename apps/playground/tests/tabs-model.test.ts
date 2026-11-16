import { expect, test } from "vite-plus/test";
import { keyboardTable, tabsSetups } from "./support/tabs";
import { afterKey, singleSteps, type TabsModel } from "./support/tabs-model";

function setupOf(list: string) {
  const setup = tabsSetups.find((candidate) => candidate.list === list);
  if (!setup) throw new Error(`${list}: the playground renders no list of tabs with this name.`);
  return setup;
}

test.each(keyboardTable)(
  "the model agrees with the keyboard table: in $list, from $start, after the keys $keys $selected is selected and focus is on $focused",
  ({ list, start, keys, focused, selected }) => {
    const setup = setupOf(list);
    const started: TabsModel = { selected: start, focused: start };

    expect(
      singleSteps(setup).map(({ from }) => from),
      "the row starts from a state the model can reach",
    ).toContainEqual(started);
    expect(keys.reduce((model, key) => afterKey(setup, model, key), started)).toEqual({
      selected,
      focused,
    });
  },
);

test("the keyboard table has a row for every list of tabs the playground renders from its setups", () => {
  expect([...new Set(keyboardTable.map(({ list }) => list))].sort()).toEqual(
    tabsSetups.map(({ list }) => list).sort(),
  );
});
