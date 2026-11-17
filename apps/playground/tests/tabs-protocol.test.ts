import fc from "fast-check";
import type { Page } from "playwright";
import { expect, inject, test } from "vite-plus/test";
import { inEveryEngine } from "#/tests/support/playground.ts";
import { activeAndSelected, panelOf, stateOf, tabLists, tabNamed } from "#/tests/support/tabs.ts";
import {
  afterKey,
  afterPressOn,
  type Key,
  keys,
  type RovingList,
  type RovingListState,
} from "#/tests/support/roving-list-model.ts";

const url = inject("playgroundUrl");
const generatedRuns = 15;
const longestSequence = 12;
type Model = RovingListState & { list: RovingList };
type Real = { page: Page };

function become(model: Model, next: RovingListState): void {
  model.selected = next.selected;
  model.focused = next.focused;
}

async function expectAgreement(model: Model, { page }: Real): Promise<void> {
  const { name: list } = model.list;
  await expect
    .poll(() => stateOf(page, list))
    .toMatchObject({
      selected: model.selected,
      focused: model.focused,
      shown: model.selected === null ? [] : [panelOf(model.selected)],
    });
  const { active, selected } = await activeAndSelected(page, list);
  expect(
    active,
    "the tabs that carry data-active are the ones whose aria-selected is true",
  ).toEqual(selected);
  const { tabStops } = await stateOf(page, list);
  expect(tabStops, "the list has one tab stop").toHaveLength(1);
  if (model.selected !== null) {
    expect(tabStops, "the tab stop is the selected tab").toEqual([model.selected]);
  }
}

abstract class Step implements fc.AsyncCommand<Model, Real> {
  abstract check(model: Model): boolean;
  abstract act(model: Model, real: Real): Promise<void>;
  abstract toString(): string;
  async run(model: Model, real: Real): Promise<void> {
    await this.act(model, real);
    await expectAgreement(model, real);
  }
}

class ClickTab extends Step {
  readonly position: number;
  constructor(position: number) {
    super();
    this.position = position;
  }
  tab = ({ list }: Model) => list.items[this.position % list.items.length];
  check = (model: Model) => !this.tab(model).disabled;
  async act(model: Model, { page }: Real) {
    const { name } = this.tab(model);
    await tabNamed(page, model.list.name, name).click();
    become(model, afterPressOn(model.list, model, name));
  }
  toString = () => `click the enabled tab at position ${this.position}, counted round the list`;
}

class PressKey extends Step {
  readonly key: Key;
  constructor(key: Key) {
    super();
    this.key = key;
  }
  check = (model: Model) => model.focused !== null;
  async act(model: Model, { page }: Real) {
    await page.keyboard.press(this.key);
    become(model, afterKey(model.list, model, this.key));
  }
  toString = () => `press ${this.key}`;
}

const steps = [
  fc.nat({ max: 11 }).map((position) => new ClickTab(position)),
  fc.constantFrom(...keys).map((key) => new PressKey(key)),
];

inEveryEngine((browser) => {
  test("for every generated sequence of clicks and keys on a list of tabs, the selected tab, the focused tab, the panel shown and the one tab stop agree with a model of that list, and the selected tab alone carries data-active", async () => {
    const page = await browser().newPage();

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...tabLists),
        fc.commands(steps, { maxCommands: longestSequence }),
        async (list, sequence) => {
          await page.goto(url, { waitUntil: "networkidle" });
          const model: Model = { list, selected: list.initial, focused: null };

          await expectAgreement(model, { page });
          await fc.asyncModelRun(() => ({ model, real: { page } }), sequence);
        },
      ),
      { numRuns: generatedRuns },
    );

    await page.close();
  });
});
