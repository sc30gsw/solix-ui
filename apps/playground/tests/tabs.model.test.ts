import type { Page } from "playwright";
import { expect, inject } from "vite-plus/test";
import { opened } from "#/tests/support/opening.ts";
import { inEveryEngine } from "#/tests/support/playground.ts";
import {
  actionLabel,
  checkedGraph,
  controlledStartOf,
  type GraphReplay,
  indexIn,
  indexOrNoneIn,
  initialStateWhere,
  keys,
  named,
  parseAction,
  replayGraph,
  type RovingList,
  rovingListOf,
  rovingStartOf,
  stepTable,
  tabStopOf,
  type TlaValue,
  varsMatch,
} from "#/tests/support/formal.ts";
import {
  clickTab,
  type ControlledSetup,
  controlled,
  controlledSetupOf,
  held,
  panelOf,
  snapshotOf,
  stateFrom,
  tabNamed,
  tabNamesOf,
  type TabsSetup,
  tabsSetups,
  valueOf,
} from "#/tests/support/tabs.ts";

const url = inject("playgroundUrl");
const rovingListModel = "formal/tabs/roving-list.model.ts";
const controlledTabsModel = "formal/tabs/controlled-tabs.model.ts";
const appHearsTheRequest = "appHearsTheRequest";

type Seen = { selected: number | null; focused: number | null };
type Asked = { value: number | null; focused: number | null };

const rovingGraph = await checkedGraph(rovingListModel);
const controlledGraph = await checkedGraph(controlledTabsModel);

function tabIn(parameters: readonly TlaValue[]): number {
  const [index] = parameters;
  if (typeof index !== "number") throw new Error(`${JSON.stringify(parameters)} names no tab.`);
  return index;
}

function keyIn(parameters: readonly TlaValue[]): string {
  const [key] = parameters;
  const found = keys.find((each) => each === key);
  if (found === undefined) throw new Error(`${JSON.stringify(parameters)} names no key.`);
  return found;
}

async function selectionOn(page: Page, list: string, names: string[]): Promise<Seen> {
  const { lists } = await snapshotOf(page, list);
  const { selected, focused } = stateFrom(lists, list, names);
  return { selected: indexIn(names, selected), focused: indexIn(names, focused) };
}

async function listAgrees(
  page: Page,
  list: string,
  names: string[],
  roving: RovingList,
  shown: Partial<Seen>,
) {
  const expected = Object.fromEntries(
    Object.entries(shown).map(([key, index]) => [key, named(names, index ?? null)]),
  );
  await expect
    .poll(async () => {
      const { lists } = await snapshotOf(page, list);
      const reading = stateFrom(lists, list, names);
      return Object.fromEntries(
        Object.keys(expected).map((key) => [key, Reflect.get(reading, key)]),
      );
    })
    .toEqual(expected);
  const { lists } = await snapshotOf(page, list);
  const reading = stateFrom(lists, list, names);
  const selection = {
    selected: indexIn(names, reading.selected),
    focused: indexIn(names, reading.focused),
  };
  expect(reading.shown, "the panel shown is the selected tab's").toEqual(
    reading.selected === null ? [] : [panelOf(reading.selected)],
  );
  expect(
    reading.tabStops,
    "the one tab stop is the selected tab, else the first enabled one",
  ).toEqual([named(names, tabStopOf(roving, selection))]);
  expect(
    reading.active,
    "the tabs that carry data-active are the ones whose aria-selected is true",
  ).toEqual(reading.ariaSelected);
}

const open = (page: Page) => opened(page, url, "hydrated");
const noCount = () => Promise.resolve(0);

function clickIn(list: string, names: string[]) {
  return (page: Page, parameters: TlaValue[]) => clickTab(page, list, names[tabIn(parameters)]);
}

const press = (page: Page, parameters: TlaValue[]) => page.keyboard.press(keyIn(parameters));

function keyLabels(focused: number | null): string[] {
  return focused === null ? [] : keys.map((key) => actionLabel("press", [key]));
}

function focusTold(names: string[], focused: number | null | undefined): string {
  return focused === undefined
    ? "focus where the engine puts it"
    : `focus on ${named(names, focused) ?? "no tab"}`;
}

function toldAct(names: string[]) {
  return (label: string) => {
    const { action, parameters } = parseAction(label);
    if (action === "click") return `click ${names[tabIn(parameters)]}`;
    if (action === "clickDisabled") return `click the disabled ${names[tabIn(parameters)]}`;
    if (action === "press") return `press ${keyIn(parameters)}`;
    return "press the app's Select none";
  };
}

function rovingReplay(setup: TabsSetup): GraphReplay<Seen> {
  const names = tabNamesOf(setup.list);
  const roving = rovingListOf(setup);
  const start = initialStateWhere(rovingGraph, rovingListModel, (vars) =>
    varsMatch(vars, rovingStartOf(setup)),
  );
  return {
    name: setup.list,
    table: stepTable(rovingGraph, start, (vars) => ({
      selected: indexOrNoneIn(vars.selected, setup.list),
      focused: indexOrNoneIn(vars.focused, setup.list),
    })),
    actions: {
      click: clickIn(setup.list, names),
      clickDisabled: (page, parameters) =>
        tabNamed(page, setup.list, names[tabIn(parameters)]).click({ force: true }),
      press,
    },
    alsoFrom: ({ focused }) => [
      ...setup.tabs.map(({ disabled }, index) =>
        actionLabel(disabled ? "clickDisabled" : "click", [index]),
      ),
      ...keyLabels(focused),
    ],
    shown: (label, to) =>
      parseAction(label).action === "clickDisabled" ? { selected: to.selected } : to,
    reset: open,
    read: (page) => selectionOn(page, setup.list, names),
    agrees: (page, shown) => listAgrees(page, setup.list, names, roving, shown),
    count: noCount,
    countedPerInternalStep: 0,
    told: ({ selected, focused }) =>
      `with ${named(names, selected ?? null) ?? "no tab"} selected and ${focusTold(names, focused)}`,
    toldAct: toldAct(names),
  };
}

type AppReading = {
  value: (page: Page, names: string[]) => Promise<number | null>;
  count: (page: Page) => Promise<number>;
  countedPerInternalStep: 0 | 1;
};

function controlledReplay(setup: ControlledSetup, app: AppReading): GraphReplay<Asked> {
  const names = tabNamesOf(setup.list);
  const roving: RovingList = {
    size: names.length,
    disabled: new Set(),
    vertical: false,
    rightToLeft: false,
    loop: true,
    selectsOnMove: true,
    deselects: false,
  };
  const refusedClick =
    setup.refused === null ? undefined : actionLabel("click", [indexIn(names, setup.refused)]);
  const start = initialStateWhere(controlledGraph, controlledTabsModel, (vars) =>
    varsMatch(vars, controlledStartOf(setup)),
  );
  return {
    name: setup.list,
    table: stepTable(
      controlledGraph,
      start,
      (vars) => ({
        value: indexOrNoneIn(vars.value, setup.list),
        focused: indexOrNoneIn(vars.focused, setup.list),
      }),
      [appHearsTheRequest],
    ),
    actions: {
      click: clickIn(setup.list, names),
      press,
      appSelectsNone: (page) => page.getByRole("button", { name: "Select none" }).click(),
    },
    alsoFrom: ({ focused }) => [
      ...names.map((_, index) => actionLabel("click", [index])),
      ...keyLabels(focused),
    ],
    shown: (label, to) => (label === refusedClick ? { value: to.value } : to),
    reset: open,
    read: async (page) => ({
      value: await app.value(page, names),
      focused: (await selectionOn(page, setup.list, names)).focused,
    }),
    agrees: async (page, shown) => {
      await expect.poll(() => app.value(page, names)).toBe(shown.value);
      await listAgrees(page, setup.list, names, roving, {
        selected: shown.value,
        ...(shown.focused === undefined ? {} : { focused: shown.focused }),
      });
    },
    count: app.count,
    countedPerInternalStep: app.countedPerInternalStep,
    told: ({ value, focused }) =>
      `with the app's value ${named(names, value ?? null) ?? "none"} and ${focusTold(names, focused)}`,
    toldAct: toldAct(names),
  };
}

const controlledReplays = [
  controlledReplay(controlledSetupOf(controlled), {
    value: async (page, names) => {
      const text = await page.getByRole("status", { name: "Controlled value" }).textContent();
      return indexIn(names, names.find((name) => valueOf(name) === text) ?? null);
    },
    count: noCount,
    countedPerInternalStep: 0,
  }),
  controlledReplay(controlledSetupOf(held), {
    value: async (page, names) => (await selectionOn(page, held, names)).selected,
    count: async (page) =>
      Number(await page.getByRole("status", { name: "Held requests" }).textContent()),
    countedPerInternalStep: 1,
  }),
];

inEveryEngine((browser) => {
  for (const replay of tabsSetups.map(rovingReplay)) replayGraph(browser, replay);
  for (const replay of controlledReplays) replayGraph(browser, replay);
});
