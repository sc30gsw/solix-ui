import { isDeepStrictEqual } from "node:util";
import { expect, test } from "vite-plus/test";
import { stepPastDisabled } from "#/packages/core/src/roving-step.ts";
import { checkedGraph } from "#/scripts/formal/run.ts";
import { booleanIn, numberIn, numbersIn, stringIn } from "#/scripts/formal/tla-value.ts";

const stepOverModel = "formal/tabs/step-over.model.ts";
const everyListTabAndMove = 2304;

const graph = await checkedGraph(stepOverModel);
const steps = graph.edges
  .filter(({ action }) => action === "pressTheKey")
  .map(({ from, to }) => {
    const before = graph.states.get(from)?.vars ?? {};
    const disabled = numbersIn(before.disabled, stepOverModel);
    return {
      disabled: Array.from({ length: numberIn(before.size, stepOverModel) }, (_, index) =>
        disabled.includes(index),
      ),
      from: numberIn(before.from, stepOverModel),
      key: stringIn(before.key, stepOverModel),
      layout: {
        vertical: booleanIn(before.vertical, stepOverModel),
        rightToLeft: booleanIn(before.rightToLeft, stepOverModel),
        loop: booleanIn(before.loop, stepOverModel),
      },
      stepped: graph.states.get(to)?.vars.stepped,
    };
  });

test("tla-ts passes the step-over model, which imports the kernel, and its graph has one step for every list of up to four tabs, every enabled starting tab and every move", () => {
  expect(steps).toHaveLength(everyListTabAndMove);
});

test("the kernel run as JavaScript steps where tla-ts's reading of it steps, for every list, starting tab and move of the model", () => {
  const disagreements = steps.flatMap(({ disabled, from, key, layout, stepped }) => {
    const ran = stepPastDisabled(disabled, from, key, layout);
    return isDeepStrictEqual({ ...ran }, stepped)
      ? []
      : [
          `${key} from ${from} in ${JSON.stringify({ disabled, ...layout })}: JavaScript gives ${JSON.stringify(ran)}, tla-ts ${JSON.stringify(stepped)}`,
        ];
  });

  expect(disagreements).toEqual([]);
});
