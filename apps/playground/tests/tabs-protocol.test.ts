import fc from "fast-check";
import type { Page } from "playwright";
import { expect, inject, test } from "vite-plus/test";
import { inEveryEngine } from "./support/playground";
import { stateOf, tabNamed, type TabsSetup, tabsSetups } from "./support/tabs";

const url = inject("playgroundUrl");
const generatedRuns = 15;
const longestSequence = 12;
const moves = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"] as const;
const presses = ["Enter", "Space"] as const;

type Move = (typeof moves)[number];
type Model = { setup: TabsSetup; selected: string | null; focused: string | null };
type Real = { page: Page };

function destinationOf({ tabs, orientation, loop }: TabsSetup, from: number, key: Move): number {
  const [forward, backward] =
    orientation === "vertical" ? ["ArrowDown", "ArrowUp"] : ["ArrowRight", "ArrowLeft"];
  const isEnabled = (index: number) => tabs[index]?.disabled === false;
  if (key === "Home") return tabs.findIndex(({ disabled }) => !disabled);
  if (key === "End") return tabs.findLastIndex(({ disabled }) => !disabled);
  if (key !== forward && key !== backward) return from;
  const step = key === forward ? 1 : -1;
  for (let walked = 1; walked < tabs.length; walked += 1) {
    const reached = from + walked * step;
    const index = loop ? (reached + tabs.length) % tabs.length : reached;
    if (index < 0 || index >= tabs.length) return from;
    if (isEnabled(index)) return index;
  }
  return from;
}

function pressOn(model: Model, name: string): void {
  model.selected = model.setup.deselects && model.selected === name ? null : name;
  model.focused = name;
}

async function expectAgreement(model: Model, { page }: Real): Promise<void> {
  const { list } = model.setup;
  await expect
    .poll(() => stateOf(page, list))
    .toMatchObject({
      selected: model.selected,
      focused: model.focused,
      shown: model.selected === null ? [] : [`${model.selected} panel`],
    });
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
  tab = ({ setup }: Model) => setup.tabs[this.position % setup.tabs.length];
  check = (model: Model) => !this.tab(model).disabled;
  async act(model: Model, { page }: Real) {
    const { name } = this.tab(model);
    await tabNamed(page, model.setup.list, name).click();
    pressOn(model, name);
  }
  toString = () => `click the enabled tab at position ${this.position}, counted round the list`;
}

class PressMove extends Step {
  readonly key: Move;
  constructor(key: Move) {
    super();
    this.key = key;
  }
  check = (model: Model) => model.focused !== null;
  async act(model: Model, { page }: Real) {
    const { setup } = model;
    const from = setup.tabs.findIndex(({ name }) => name === model.focused);
    const to = setup.tabs[destinationOf(setup, from, this.key)].name;
    await page.keyboard.press(this.key);
    if (setup.selectsOnArrow && to !== model.focused) model.selected = to;
    model.focused = to;
  }
  toString = () => `press ${this.key}`;
}

class PressToSelect extends Step {
  readonly key: (typeof presses)[number];
  constructor(key: (typeof presses)[number]) {
    super();
    this.key = key;
  }
  check = (model: Model) => model.focused !== null;
  async act(model: Model, { page }: Real) {
    await page.keyboard.press(this.key);
    if (model.focused !== null) pressOn(model, model.focused);
  }
  toString = () => `press ${this.key}`;
}

const steps = [
  fc.nat({ max: 11 }).map((position) => new ClickTab(position)),
  fc.constantFrom(...moves).map((key) => new PressMove(key)),
  fc.constantFrom(...presses).map((key) => new PressToSelect(key)),
];

inEveryEngine((browser) => {
  test("for every generated sequence of clicks and keys on a list of tabs, the selected tab, the focused tab, the panel shown and the one tab stop agree with a model of that list", async () => {
    const page = await browser().newPage();

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...tabsSetups),
        fc.commands(steps, { maxCommands: longestSequence }),
        async (setup, sequence) => {
          await page.goto(url, { waitUntil: "networkidle" });
          const model: Model = { setup, selected: setup.initial, focused: null };

          await expectAgreement(model, { page });
          await fc.asyncModelRun(() => ({ model, real: { page } }), sequence);
        },
      ),
      { numRuns: generatedRuns },
    );

    await page.close();
  });
});
