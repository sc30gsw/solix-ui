import fc from "fast-check";
import type { Page } from "playwright";
import { expect, inject, test } from "vite-plus/test";
import { inEveryEngine } from "#/tests/support/playground.ts";
import {
  activeAndSelected,
  clickMissedItsTab,
  clickTab,
  optional,
  panelOf,
  stateOf,
  stillFrames,
  tabLists,
  tabNames,
} from "#/tests/support/tabs.ts";
import {
  afterKey,
  afterPressOn,
  type Key,
  keys,
  type RovingList,
  type RovingListState,
} from "#/tests/support/roving-list-model.ts";
import { assertProperty } from "../../../tests/support/properties.ts";

const url = inject("playgroundUrl");
const generatedRuns = 15;
const longestSequence = 12;
const generatedSequencesTimeout = 90_000;
const scrollMovesObserved = 4;
const scrollAwayFromThePointer = 200;
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
    await clickTab(page, model.list.name, name);
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

const { notes, files } = tabNames.optional;

function theOptionalList(): RovingList {
  const list = tabLists.find(({ name }) => name === optional);
  if (!list) throw new Error(`${optional}: the playground describes no list of tabs so.`);
  return list;
}

function atTheStartOf(list: RovingList): Model {
  return { list, selected: list.initial, focused: null };
}

function clickOn(list: RovingList, tab: string): ClickTab {
  return new ClickTab(list.items.findIndex(({ name }) => name === tab));
}

const steps = [
  fc.nat({ max: 11 }).map((position) => new ClickTab(position)),
  fc.constantFrom(...keys).map((key) => new PressKey(key)),
];

inEveryEngine((browser) => {
  test(
    "for every generated sequence of clicks and keys on a list of tabs, the selected tab, the focused tab, the panel shown and the one tab stop agree with a model of that list, and the selected tab alone carries data-active",
    { timeout: generatedSequencesTimeout },
    async (context) => {
      const page = await browser().newPage();

      await assertProperty(
        context,
        fc.asyncProperty(
          fc.constantFrom(...tabLists),
          fc.commands(steps, { maxCommands: longestSequence }),
          async (list, sequence) => {
            await page.goto(url, { waitUntil: "networkidle" });
            const model = atTheStartOf(list);

            await expectAgreement(model, { page });
            await fc.asyncModelRun(() => ({ model, real: { page } }), sequence);
          },
        ),
        { numRuns: generatedRuns },
      );

      await page.close();
    },
  );

  test("a click on a tab begins only once the page has stopped scrolling, also when the scrolling pauses for fewer frames than the drive waits", async () => {
    const page = await browser().newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    const list = theOptionalList();
    const model = atTheStartOf(list);
    await clickOn(list, files).run(model, { page });
    const scrolling = await page.evaluateHandle(
      ({ moves, pause }) => {
        const state: { left: number; leftWhenPressed: number | undefined } = {
          left: moves,
          leftWhenPressed: undefined,
        };
        const first = window.scrollY > 0 ? -1 : 1;
        let frames = 0;
        const frame = () => {
          frames += 1;
          if (frames % pause === 0) {
            window.scrollBy(0, state.left % 2 === 0 ? first : -first);
            state.left -= 1;
          }
          if (state.left > 0) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
        window.addEventListener(
          "pointerdown",
          () => {
            state.leftWhenPressed = state.left;
          },
          { capture: true, once: true },
        );
        return state;
      },
      { moves: scrollMovesObserved, pause: stillFrames - 1 },
    );

    await clickOn(list, notes).run(model, { page });

    expect(
      await scrolling.evaluate(({ leftWhenPressed }) => leftWhenPressed),
      "the scroll movements still to come when the press began",
    ).toBe(0);
    await page.close();
  });

  test("a click that does not reach its tab, because the page moves under the pointer, fails by saying so and not as a disagreement with the model", async () => {
    const page = await browser().newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    const list = theOptionalList();
    const model = atTheStartOf(list);
    await clickOn(list, files).run(model, { page });
    await page.evaluate((distance) => {
      window.addEventListener(
        "mousedown",
        () => window.scrollBy(0, window.scrollY > 0 ? -distance : distance),
        { capture: true, once: true },
      );
    }, scrollAwayFromThePointer);

    await expect(clickOn(list, notes).run(model, { page })).rejects.toThrow(clickMissedItsTab);
    await page.close();
  });
});
