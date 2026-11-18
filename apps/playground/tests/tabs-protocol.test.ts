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
const observedRepetitions = 50;
const observationTimeout = 180_000;
const observedEvents = ["pointerdown", "mousedown", "mouseup", "click", "keydown", "scroll"];
const eventLog = "eventsSeenByTheObservation";
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

type Seen = { type: string; at: number; scrollY: number; tab: string | null };

type Observed = {
  disagreement: string | undefined;
  clicked: (string | null)[];
  scrollAfterTheKey: number[];
  stillBeforeThePress: number[];
  movedAfterThePress: boolean;
  seen: Seen[];
};

async function recordEvents(page: Page): Promise<void> {
  await page.addInitScript(
    ({ types, log }) => {
      const seen: Seen[] = [];
      Reflect.set(window, log, seen);
      for (const type of types) {
        window.addEventListener(
          type,
          ({ target }) => {
            const tab = target instanceof Element ? target.closest('[role="tab"]') : null;
            seen.push({
              type,
              at: Math.round(performance.now()),
              scrollY: Math.round(window.scrollY),
              tab: tab?.textContent ?? null,
            });
          },
          { capture: true, passive: true },
        );
      }
    },
    { types: observedEvents, log: eventLog },
  );
}

function eventsSeen(page: Page): Promise<Seen[]> {
  return page.evaluate((log) => Reflect.get(window, log) as Seen[], eventLog);
}

function observed(seen: Seen[], disagreement: string | undefined): Observed {
  const scrolls = (events: Seen[]) => events.filter(({ type }) => type === "scroll");
  const key = seen.findLastIndex(({ type }) => type === "keydown");
  const press = seen.findLastIndex(({ type }) => type === "pointerdown");
  const pressFollowsTheKey = key !== -1 && press > key;
  const ofTheKey =
    key === -1 ? [] : scrolls(seen.slice(key, pressFollowsTheKey ? press : undefined));
  const lastOfTheKey = ofTheKey.at(-1);
  return {
    disagreement,
    clicked: seen.filter(({ type }) => type === "click").map(({ tab }) => tab),
    scrollAfterTheKey: ofTheKey.map(({ at }) => at - seen[key].at),
    stillBeforeThePress:
      pressFollowsTheKey && lastOfTheKey ? [seen[press].at - lastOfTheKey.at] : [],
    movedAfterThePress:
      pressFollowsTheKey &&
      scrolls(seen.slice(press)).some(({ scrollY }) => scrollY !== seen[press].scrollY),
    seen,
  };
}

function between(values: number[]): string {
  return values.length === 0 ? "never" : `${Math.min(...values)} to ${Math.max(...values)} ms`;
}

function written({ type, at, scrollY, tab }: Seen): string {
  return `${type} on ${tab ?? "no tab"} at ${at} ms with the page scrolled to ${scrollY}`;
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

  test(
    `observation: repeated ${observedRepetitions} times from a fresh page load, a click on a tab, a key the list leaves to the page and a click on another tab keep the page in agreement with the model, and each click reaches its tab`,
    { timeout: observationTimeout },
    async (context) => {
      const list = theOptionalList();
      const sequence = [clickOn(list, files), new PressKey("ArrowUp"), clickOn(list, notes)];
      const page = await browser().newPage();
      await recordEvents(page);
      const repetitions: Observed[] = [];

      for (let repetition = 0; repetition < observedRepetitions; repetition += 1) {
        await page.goto(url, { waitUntil: "networkidle" });
        const model = atTheStartOf(list);
        let disagreement: string | undefined;
        for (const step of sequence) {
          try {
            await step.run(model, { page });
          } catch (error) {
            disagreement = `after "${step.toString()}", ${String(error).split("\n")[0]}`;
            break;
          }
        }
        repetitions.push(observed(await eventsSeen(page), disagreement));
      }
      await page.close();

      const count = (holds: (repetition: Observed) => boolean) => repetitions.filter(holds).length;
      const missedAClick = ({ clicked }: Observed) => clicked.join() !== [files, notes].join();
      const summary = [
        `In ${browser().browserType().name()}, of ${observedRepetitions} repetitions, ${count(({ disagreement }) => disagreement !== undefined)} disagreed with the model and in ${count(missedAClick)} a click did not reach its tab.`,
        `In ${count(({ scrollAfterTheKey }) => scrollAfterTheKey.length > 0)} the page scrolled after the key, ${between(repetitions.flatMap(({ scrollAfterTheKey }) => scrollAfterTheKey))} after it.`,
        `The next press began ${between(repetitions.flatMap(({ stillBeforeThePress }) => stillBeforeThePress))} after the last of those scrolls, and in ${count(({ movedAfterThePress }) => movedAfterThePress)} the page moved again once that press had begun.`,
      ].join(" ");
      await context.annotate(summary);

      expect(
        repetitions.flatMap((repetition, index) =>
          repetition.disagreement !== undefined || missedAClick(repetition)
            ? [
                `repetition ${index}: ${repetition.disagreement ?? "the page agreed with the model"}; ${repetition.seen.map(written).join("; ")}`,
              ]
            : [],
        ),
        summary,
      ).toEqual([]);
    },
  );
});
