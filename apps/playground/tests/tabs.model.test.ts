import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, test } from "vite-plus/test";
import { controlledConfig, heldConfig, tabsConfigs } from "../../../formal/tabs/tabs-configs.ts";
import {
  checkedGraph,
  initialStateWhere,
  keyOf,
  parseAction,
  pathBetween,
  type StateGraph,
  type StepTable,
  stepTable,
  type TlaValue,
  type Vars,
} from "../../../tests/support/formal-graph.ts";
import { opened } from "#/tests/support/opening.ts";
import { inEveryEngine } from "#/tests/support/playground.ts";
import { afterAction, keys, type RovingListState } from "#/tests/support/roving-list-model.ts";
import {
  clickTab,
  controlled,
  held,
  type ModelConfig,
  modelConfigOf,
  panelOf,
  snapshotOf,
  stateFrom,
  tabLists,
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
const appSelectsNone = "appSelectsNone";
const countedUpTo = 2;

type Seen = { selected: number | null; focused: number | null };
type Held = { value: number | null; focused: number | null; requests: number };

type Act = {
  label: string;
  told: string;
  tab?: number;
  key?: (typeof keys)[number];
  disabledTab?: number;
};

type Replayed<State> = {
  list: string;
  names: string[];
  table: StepTable<State>;
  actionsFrom: (state: State) => Act[];
  told: (state: State) => string;
  read: (page: Page) => Promise<State>;
  agrees: (page: Page, state: State) => Promise<void>;
  selectNone?: (page: Page) => Promise<void>;
};

function tabOf(value: TlaValue, where: string): number | null {
  if (value === null || typeof value === "number") return value;
  throw new Error(`${where}: the model holds ${JSON.stringify(value)}, not a tab or none.`);
}

function countOf(value: TlaValue, where: string): number {
  if (typeof value === "number") return value;
  throw new Error(`${where}: the model holds ${JSON.stringify(value)}, not a count.`);
}

function matchesConfig(config: ModelConfig) {
  return (vars: Vars) =>
    vars.size === config.size &&
    keyOf(vars.disabled) === keyOf(config.disabled) &&
    vars.vertical === config.vertical &&
    vars.rightToLeft === config.rightToLeft &&
    vars.loop === config.loop &&
    vars.selectsOnMove === config.selectsOnMove &&
    vars.deselects === config.deselects &&
    vars.selected === config.initial;
}

function nameIn(names: readonly string[], index: number | null): string | null {
  return index === null ? null : (names[index] ?? null);
}

function indexIn(names: readonly string[], name: string | null): number | null {
  if (name === null) return null;
  const index = names.indexOf(name);
  return index === -1 ? null : index;
}

function keyActions(focused: number | null): Act[] {
  if (focused === null) return [];
  return keys.map((key) => ({ label: `press(${JSON.stringify(key)})`, told: `press ${key}`, key }));
}

function rovingTableOf(graph: StateGraph, setup: TabsSetup): StepTable<Seen> {
  const start = initialStateWhere(graph, matchesConfig(modelConfigOf(setup)));
  return stepTable(graph, start, (vars) => ({
    selected: tabOf(vars.selected, setup.list),
    focused: tabOf(vars.focused, setup.list),
  }));
}

async function seenOn(page: Page, list: string, names: string[]): Promise<Seen> {
  const { lists } = await snapshotOf(page, list);
  const { selected, focused } = stateFrom(lists, list, names);
  return { selected: indexIn(names, selected), focused: indexIn(names, focused) };
}

async function agreesWithTheList(page: Page, list: string, names: string[], to: Seen) {
  const selected = nameIn(names, to.selected);
  await expect
    .poll(async () => {
      const { lists } = await snapshotOf(page, list);
      const { selected: shownSelected, focused, shown } = stateFrom(lists, list, names);
      return { selected: shownSelected, focused, shown };
    })
    .toEqual({
      selected,
      focused: nameIn(names, to.focused),
      shown: selected === null ? [] : [panelOf(selected)],
    });
  const { lists } = await snapshotOf(page, list);
  const { tabStops, active, ariaSelected } = stateFrom(lists, list, names);
  expect(tabStops, "the list has one tab stop").toHaveLength(1);
  if (selected !== null) expect(tabStops, "the tab stop is the selected tab").toEqual([selected]);
  expect(
    active,
    "the tabs that carry data-active are the ones whose aria-selected is true",
  ).toEqual(ariaSelected);
}

function replayedSetup(graph: StateGraph, setup: TabsSetup): Replayed<Seen> {
  const names = tabNamesOf(setup.list);
  return {
    list: setup.list,
    names,
    table: rovingTableOf(graph, setup),
    actionsFrom: ({ focused }) => [
      ...setup.tabs.map(({ name, disabled }, index) => ({
        label: `click(${index})`,
        told: `click ${name}`,
        ...(disabled ? { disabledTab: index } : { tab: index }),
      })),
      ...keyActions(focused),
    ],
    told: ({ selected, focused }) =>
      `with ${nameIn(names, selected) ?? "no tab"} selected and focus on ${nameIn(names, focused) ?? "no tab"}`,
    read: (page) => seenOn(page, setup.list, names),
    agrees: (page, to) => agreesWithTheList(page, setup.list, names, to),
  };
}

function heldTableOf(graph: StateGraph, list: string, config: typeof heldConfig) {
  const start = initialStateWhere(
    graph,
    (vars) =>
      vars.size === config.size &&
      vars.follows === config.follows &&
      vars.refused === config.refused &&
      vars.value === config.value,
  );
  return stepTable(
    graph,
    start,
    (vars): Held => ({
      value: tabOf(vars.value, list),
      focused: tabOf(vars.focused, list),
      requests: config.follows ? 0 : countOf(vars.requests, list),
    }),
    [appHearsTheRequest],
  );
}

async function controlledOn(
  page: Page,
  list: string,
  names: string[],
  follows: boolean,
): Promise<Held> {
  const { selected, focused } = await seenOn(page, list, names);
  if (follows) {
    const text = await page.getByRole("status", { name: "Controlled value" }).textContent();
    return {
      value: indexIn(names, names.find((name) => valueOf(name) === text) ?? null),
      focused,
      requests: 0,
    };
  }
  const requests = Number(await page.getByRole("status", { name: "Held requests" }).textContent());
  return { value: selected, focused, requests: Math.min(requests, countedUpTo) };
}

function replayedControlled(
  graph: StateGraph,
  list: string,
  config: typeof heldConfig,
): Replayed<Held> {
  const names = tabNamesOf(list);
  const table = heldTableOf(graph, list, config);
  return {
    list,
    names,
    table,
    actionsFrom: ({ focused, value }) => [
      ...names
        .filter((_, index) => index !== config.refused)
        .map((name) => ({
          label: `click(${names.indexOf(name)})`,
          told: `click ${name}`,
          tab: names.indexOf(name),
        })),
      ...keyActions(focused),
      ...(config.follows && value !== null
        ? [{ label: appSelectsNone, told: "press the app's Select none" }]
        : []),
    ],
    told: ({ value, focused, requests }) =>
      `with the app's value ${nameIn(names, value) ?? "none"}, focus on ${nameIn(names, focused) ?? "no tab"}${config.follows ? "" : ` and ${requests} requests told`}`,
    read: (page) => controlledOn(page, list, names, config.follows),
    agrees: async (page, to) => {
      await expect.poll(() => controlledOn(page, list, names, config.follows)).toEqual(to);
      await agreesWithTheList(page, list, names, { selected: to.value, focused: to.focused });
    },
    selectNone: (page) => page.getByRole("button", { name: "Select none" }).click(),
  };
}

async function perform<State>(page: Page, replayed: Replayed<State>, label: string) {
  const { action, parameters } = parseAction(label);
  const [parameter] = parameters;
  if (action === "click" && typeof parameter === "number") {
    await clickTab(page, replayed.list, replayed.names[parameter]);
  } else if (action === "press" && typeof parameter === "string") {
    await page.keyboard.press(parameter);
  } else if (action === appSelectsNone && replayed.selectNone !== undefined) {
    await replayed.selectNone(page);
  } else {
    throw new Error(`${replayed.list}: the replay does not know how to ${label}.`);
  }
}

async function bringTo<State>(page: Page, replayed: Replayed<State>, from: State) {
  const start = replayed.table.states.get(replayed.table.start);
  if (start === undefined) throw new Error(`${replayed.list}: the model has no start.`);
  let path = pathBetween(replayed.table, await replayed.read(page), from);
  if (path === undefined) {
    await opened(page, url, "hydrated");
    path = pathBetween(replayed.table, start, from);
  }
  if (path === undefined) {
    throw new Error(`${replayed.list}: the model reaches no ${keyOf(from)} from its start.`);
  }
  for (const label of path) await perform(page, replayed, label);
  await replayed.agrees(page, from);
}

type Replay<State> = { replayed: Replayed<State>; from: State; act: Act; to: State; name: string };

function replaysOf<State>(replayed: Replayed<State>): Replay<State>[] {
  return [...replayed.table.states.values()].flatMap((from) =>
    replayed.actionsFrom(from).map((act) => {
      const to =
        act.disabledTab === undefined
          ? (replayed.table.steps.get(keyOf(from))?.get(act.label)?.to ?? from)
          : from;
      return {
        replayed,
        from,
        act,
        to,
        name: `in ${replayed.list}, ${replayed.told(from)}, ${act.told}: ${act.disabledTab === undefined ? replayed.told(to) : "the selection stays"}`,
      };
    }),
  );
}

const rovingGraph = checkedGraph(rovingListModel);
const controlledGraph = checkedGraph(controlledTabsModel);
const rovingReplays = tabsSetups.map((setup) => replayedSetup(rovingGraph, setup));
const controlledReplays = [
  replayedControlled(controlledGraph, controlled, controlledConfig),
  replayedControlled(controlledGraph, held, heldConfig),
];

describe("the models of Tabs and the playground", () => {
  test("the lists of the roving-list model's keyboard table are the playground's setups, in order", () => {
    expect(
      tabsConfigs.map(({ disabled, ...config }) => ({
        ...config,
        disabled: [...disabled].sort((one, other) => one - other),
      })),
    ).toEqual(tabsSetups.map(modelConfigOf));
  });

  test("the controlled model's lists have as many tabs as the playground's controlled and held lists", () => {
    expect([controlledConfig.size, heldConfig.size]).toEqual([
      tabNamesOf(controlled).length,
      tabNamesOf(held).length,
    ]);
  });

  test.each(tabLists.map((list, index) => ({ list, replayed: rovingReplays[index] })))(
    "the generated check's model of $list.name takes every click and key from every state where the roving-list model's graph does",
    ({ list, replayed }) => {
      const disagreements = replaysOf(replayed)
        .filter(({ act }) => act.disabledTab === undefined)
        .flatMap(({ from, act, to, name }) => {
          const state: RovingListState = {
            selected: nameIn(replayed.names, from.selected),
            focused: nameIn(replayed.names, from.focused),
          };
          const step =
            act.tab === undefined
              ? { key: act.key ?? keys[0] }
              : { click: replayed.names[act.tab] };
          const after = afterAction(list, state, step);
          const expected = {
            selected: nameIn(replayed.names, to.selected),
            focused: nameIn(replayed.names, to.focused),
          };
          return keyOf(after) === keyOf(expected) ? [] : [`${name}, but it has ${keyOf(after)}`];
        });
      expect(disagreements).toEqual([]);
    },
  );
});

function replayEveryStep<State>(browser: () => Browser, replayed: Replayed<State>): void {
  describe(`every step of the model of ${replayed.list}`, () => {
    let page: Page;

    beforeAll(async () => {
      page = await browser().newPage();
      await opened(page, url, "hydrated");
    });

    afterAll(async () => {
      await page.close();
    });

    test.each(replaysOf(replayed))("$name", async ({ from, act, to }) => {
      await bringTo(page, replayed, from);
      if (act.disabledTab === undefined) {
        await perform(page, replayed, act.label);
        await replayed.agrees(page, to);
        return;
      }
      const before = await snapshotOf(page, replayed.list);
      const { selected, shown } = stateFrom(before.lists, replayed.list, replayed.names);
      await tabNamed(page, replayed.list, replayed.names[act.disabledTab]).click({ force: true });
      const after = await snapshotOf(page, replayed.list);
      expect(stateFrom(after.lists, replayed.list, replayed.names)).toMatchObject({
        selected,
        shown,
      });
    });
  });
}

inEveryEngine((browser) => {
  for (const replayed of rovingReplays) replayEveryStep(browser, replayed);
  for (const replayed of controlledReplays) replayEveryStep(browser, replayed);
});
