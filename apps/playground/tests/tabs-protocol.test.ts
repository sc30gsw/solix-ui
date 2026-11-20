import fc from "fast-check";
import type { Page } from "playwright";
import { expect, inject, test } from "vite-plus/test";
import { hydrationTimeout, opened, pageDidNotBecomeReady } from "#/tests/support/opening.ts";
import { inEveryEngine } from "#/tests/support/playground.ts";
import {
  clickMissedItsTab,
  clickTab,
  optional,
  panelOf,
  snapshotOf,
  stateFrom,
  type TabsSnapshot,
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
const generatedSequencesTimeout = 55_000;
const scrollAwayFromThePointer = 200;
const notATab = "a tab the list does not have";
const unrenderedList = "<main><p>no list of tabs yet</p></main>";
const failsWithin = 5_000;
type Model = RovingListState & { list: RovingList };
type Real = { page: Page; openedAt: number };

function become(model: Model, next: RovingListState): void {
  model.selected = next.selected;
  model.focused = next.focused;
}

async function expectAgreement(model: Model, { page, openedAt }: Real): Promise<void> {
  const { name: list } = model.list;
  const expected = {
    selected: model.selected,
    focused: model.focused,
    shown: model.selected === null ? [] : [panelOf(model.selected)],
  };
  const firstPoll = performance.now();
  let last: TabsSnapshot | undefined;
  try {
    await expect
      .poll(async () => {
        last = await snapshotOf(page, list);
        return stateFrom(last, list);
      })
      .toMatchObject(expected);
  } catch (cause) {
    throw new Error(
      `${list}: the page does not agree with the model, which expects ${JSON.stringify(expected)}. It first polled ${Math.round(firstPoll - openedAt)} ms after the page was ready, and gave up ${Math.round(performance.now() - firstPoll)} ms later. The page showed ${last === undefined ? "nothing: no snapshot of it came back" : JSON.stringify(last)}.`,
      { cause },
    );
  }
  if (last === undefined) throw new Error(`${list}: the poll agreed with no snapshot of the page.`);
  const { active, ariaSelected, tabStops } = stateFrom(last, list);
  expect(
    active,
    "the tabs that carry data-active are the ones whose aria-selected is true",
  ).toEqual(ariaSelected);
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

function everySequenceAgreesOn(page: Page) {
  return fc.asyncProperty(
    fc.constantFrom(...tabLists),
    fc.commands(steps, { maxCommands: longestSequence }),
    async (list, sequence) => {
      await opened(page, url, "hydrated");
      const real = { page, openedAt: performance.now() };
      const model = atTheStartOf(list);

      await expectAgreement(model, real);
      await fc.asyncModelRun(() => ({ model, real }), sequence);
    },
  );
}

const lateBy = 2_000;
const lateClientScripts: Record<string, string> = {
  "waits before it hydrates the page": `await new Promise((resolve) => setTimeout(resolve, ${lateBy}));`,
  "keeps the page busy before it hydrates it": `for (const end = Date.now() + ${lateBy}; Date.now() < end; );`,
};
const neverHydrates = "await new Promise(() => {});";
const thrownBeforeHydrating = "the client script threw before it hydrated the page";
const refusingAddress = "http://127.0.0.1:9/";
const throwsBeforeHydrating = `throw new Error(${JSON.stringify(thrownBeforeHydrating)});`;
const waitForAPageThatNeverHydrates = 1_000;

async function withItsClientScriptAfter(page: Page, delay: string): Promise<void> {
  await page.route("**/*.js", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${delay}\n${await response.text()}` });
  });
}

const firstRunsThatFailedInCi = [
  { seed: -19_020_418, path: "0" },
  { seed: -2_077_914_389, path: "0" },
];

inEveryEngine((browser) => {
  test(
    "for every generated sequence of clicks and keys on a list of tabs, the selected tab, the focused tab, the panel shown and the one tab stop agree with a model of that list, and the selected tab alone carries data-active",
    { timeout: generatedSequencesTimeout },
    async (context) => {
      const page = await browser().newPage();

      await assertProperty(context, everySequenceAgreesOn(page), { numRuns: generatedRuns });

      await page.close();
    },
  );

  for (const [how, delay] of Object.entries(lateClientScripts)) {
    test(`on a page whose client script ${how}, the sequences that failed in CI as the first run in a cold engine agree with the model`, async (context) => {
      const page = await browser().newPage();
      await withItsClientScriptAfter(page, delay);

      for (const { seed, path } of firstRunsThatFailedInCi) {
        await assertProperty(context, everySequenceAgreesOn(page), { seed, path, numRuns: 1 });
      }

      await page.close();
    });
  }

  test("on a page whose client script never hydrates it, the drive fails by saying that the page did not become ready, and by default it says so before the test's own timeout", async (context) => {
    const page = await browser().newPage();
    await withItsClientScriptAfter(page, neverHydrates);

    await expect(
      opened(page, url, "hydrated", { timeout: waitForAPageThatNeverHydrates }),
    ).rejects.toThrow(pageDidNotBecomeReady);
    expect(hydrationTimeout).toBeLessThan(context.task.timeout);

    await page.close();
  });

  test("on a page whose client script throws before it hydrates it, the drive fails by saying that the page did not become ready, with the error the page raised", async () => {
    const page = await browser().newPage();
    await withItsClientScriptAfter(page, throwsBeforeHydrating);

    const failure = opened(page, url, "hydrated", {
      timeout: waitForAPageThatNeverHydrates,
      reportsToTheConsole: `pageerror: Error: ${thrownBeforeHydrating}`,
    });
    await expect(failure).rejects.toThrow(pageDidNotBecomeReady);
    await expect(failure).rejects.toThrow(thrownBeforeHydrating);

    await page.close();
  });

  test("at an address that refuses the connection, opening fails with the navigation's own error and not as a page that did not become ready", async () => {
    const page = await browser().newPage();

    const failure = opened(page, refusingAddress, "hydrated", {
      reportsToTheConsole: `error: Not allowed to use restricted network port 9: ${refusingAddress}`,
    });
    await expect(failure).rejects.toThrow(/page\.goto/);
    await expect(failure).rejects.not.toThrow(pageDidNotBecomeReady);

    await page.close();
  });

  test("a disagreement with the model says what the page showed: each tab and panel, the document's state, its stylesheets and its scroll", async () => {
    const page = await browser().newPage();
    const [list] = tabLists;
    if (list === undefined) throw new Error("the playground renders no list of tabs.");
    const model = atTheStartOf(list);
    model.focused = notATab;
    await opened(page, url, "hydrated");

    const failure = await expectAgreement(model, { page, openedAt: performance.now() }).then(
      () => "",
      (error: unknown) => String(error),
    );

    for (const shown of [
      "after the page was ready",
      "readyState",
      "stylesheets",
      "scrollY",
      "ariaSelected",
      "dataActive",
      "hidden",
      "display",
    ]) {
      expect(failure).toContain(shown);
    }
    expect(failure).toContain(notATab);
    await page.close();
  });

  test("a disagreement on a page that renders no such list of tabs says what the page showed, well within the test's timeout", async () => {
    const page = await browser().newPage();
    await page.setContent(unrenderedList);
    const [list] = tabLists;
    if (list === undefined) throw new Error("the playground renders no list of tabs.");
    const asked = performance.now();

    const failure = await expectAgreement(atTheStartOf(list), { page, openedAt: asked }).then(
      () => "",
      (error: unknown) => String(error),
    );

    expect(performance.now() - asked).toBeLessThan(failsWithin);
    for (const shown of [list.name, "readyState", "stylesheets", "scrollY", "lists"]) {
      expect(failure).toContain(shown);
    }
    await page.close();
  });

  test("a click that does not reach its tab, because the page moves under the pointer, fails by saying so and not as a disagreement with the model", async () => {
    const page = await browser().newPage();
    await opened(page, url, "hydrated");
    const list = theOptionalList();
    const model = atTheStartOf(list);
    const real = { page, openedAt: performance.now() };
    await clickOn(list, files).run(model, real);
    await page.evaluate((distance) => {
      window.addEventListener(
        "mousedown",
        () => window.scrollBy(0, window.scrollY > 0 ? -distance : distance),
        { capture: true, once: true },
      );
    }, scrollAwayFromThePointer);

    await expect(clickOn(list, notes).run(model, real)).rejects.toThrow(clickMissedItsTab);
    await page.close();
  });
});
