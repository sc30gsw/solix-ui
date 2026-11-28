import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { parseAction } from "#/scripts/formal/state-graph.ts";
import { pathBetween, type StepTable } from "#/scripts/formal/step-table.ts";
import { keyOf, type TlaValue } from "#/scripts/formal/tla-value.ts";

type PageAction = (page: Page, parameters: TlaValue[]) => Promise<void>;

export type GraphReplay<State extends object> = {
  name: string;
  table: StepTable<State>;
  actions: Readonly<Record<string, PageAction>>;
  alsoFrom: (state: State) => string[];
  shown: (label: string, to: State) => Partial<State>;
  reset: (page: Page) => Promise<void>;
  read: (page: Page) => Promise<State>;
  agrees: (page: Page, shown: Partial<State>) => Promise<void>;
  count: (page: Page) => Promise<number>;
  countedPerInternalStep: 0 | 1;
  told: (state: Partial<State>) => string;
  toldAct: (label: string) => string;
};

type Replay<State> = { from: State; label: string; to: State; internal: number; name: string };

function settled(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())), 0);
      }),
  );
}

function agreesOn<State extends object>(state: State, shown: Partial<State>): boolean {
  const picked = Object.fromEntries(
    Object.keys(shown).map((key) => [key, Reflect.get(state, key)]),
  );
  return keyOf(picked) === keyOf(shown);
}

function replaysOf<State extends object>(replay: GraphReplay<State>): Replay<State>[] {
  return [...replay.table.states.values()].flatMap((from) => {
    const steps = replay.table.steps.get(keyOf(from)) ?? new Map();
    const labels = [...new Set([...steps.keys(), ...replay.alsoFrom(from)])].sort((one, other) =>
      one.localeCompare(other),
    );
    return labels.map((label) => {
      const step = steps.get(label);
      const to = step?.to ?? from;
      return {
        from,
        label,
        to,
        internal: step?.internal ?? 0,
        name: `in ${replay.name}, ${replay.told(from)}, ${replay.toldAct(label)}: ${replay.told(replay.shown(label, to))}`,
      };
    });
  });
}

export function replayGraph<State extends object>(
  browser: () => Browser,
  replay: GraphReplay<State>,
): void {
  describe(`every step of the model of ${replay.name}`, () => {
    let page: Page;
    let reached: Partial<State> = replay.table.start;

    const perform = async (label: string) => {
      const { action, parameters } = parseAction(label);
      const act = replay.actions[action];
      if (act === undefined) throw new Error(`${replay.name}: the replay cannot ${label}.`);
      await act(page, parameters);
    };

    const startOver = async () => {
      await replay.reset(page);
      await replay.agrees(page, replay.table.start);
      return replay.table.start;
    };

    const bringTo = async (from: State) => {
      const now = await replay.read(page);
      if (!agreesOn(now, reached)) {
        throw new Error(
          `${replay.name}: the page left the state the last step reached. It shows ${keyOf(now)}, and the model reached ${keyOf(reached)}.`,
        );
      }
      reached = {};
      const known = replay.table.states.has(keyOf(now)) ? now : await startOver();
      const path =
        pathBetween(replay.table, known, from) ??
        pathBetween(replay.table, await startOver(), from);
      if (path === undefined) {
        throw new Error(`${replay.name}: the model reaches no ${keyOf(from)} from its start.`);
      }
      for (const label of path) await perform(label);
      await replay.agrees(page, from);
    };

    beforeAll(async () => {
      page = await browser().newPage();
      await replay.reset(page);
    });

    afterAll(async () => {
      await page.close();
    });

    test(`the replay performs every action the model of ${replay.name} takes`, () => {
      const taken = [...replay.table.steps.values()].flatMap((steps) =>
        [...steps.keys()].map((label) => parseAction(label).action),
      );
      expect([...new Set(taken)].filter((action) => replay.actions[action] === undefined)).toEqual(
        [],
      );
    });

    for (const { from, label, to, internal, name } of replaysOf(replay)) {
      test(name, async () => {
        await bringTo(from);
        const counted = await replay.count(page);
        await perform(label);
        const shown = replay.shown(label, to);
        await replay.agrees(page, shown);
        await settled(page);
        await replay.agrees(page, shown);
        expect(
          (await replay.count(page)) - counted,
          "the app heard each request the model's internal steps deliver, once",
        ).toBe(internal * replay.countedPerInternalStep);
        reached = shown;
      });
    }
  });
}
