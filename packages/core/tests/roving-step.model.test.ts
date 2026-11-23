import { isDeepStrictEqual } from "node:util";
import { expect, test } from "vite-plus/test";
import { runModel, type TlaValue } from "../../../tests/support/formal-graph.ts";
import { stepPastDisabled } from "#/src/roving-step.ts";

const stepOverModel = "formal/tabs/step-over.model.ts";
const pressTheKey = "pressTheKey";

function numberOf(value: TlaValue): number {
  if (typeof value !== "number") throw new Error(`${JSON.stringify(value)} is not a number.`);
  return value;
}

function stringOf(value: TlaValue): string {
  if (typeof value !== "string") throw new Error(`${JSON.stringify(value)} is not a string.`);
  return value;
}

function booleanOf(value: TlaValue): boolean {
  if (typeof value !== "boolean") throw new Error(`${JSON.stringify(value)} is not a boolean.`);
  return value;
}

const run = runModel(stepOverModel, { dump: true });
const steps = (run.graph?.edges ?? [])
  .filter(({ action }) => action === pressTheKey)
  .map(({ from, to }) => {
    const before = run.graph?.states.get(from)?.vars ?? {};
    const after = run.graph?.states.get(to)?.vars ?? {};
    const size = numberOf(before.size);
    const disabled = Array.isArray(before.disabled) ? before.disabled.map(numberOf) : [];
    return {
      disabled: Array.from({ length: size }, (_, index) => disabled.includes(index)),
      from: numberOf(before.from),
      key: stringOf(before.key),
      layout: {
        vertical: booleanOf(before.vertical),
        rightToLeft: booleanOf(before.rightToLeft),
        loop: booleanOf(before.loop),
      },
      stepped: after.stepped,
    };
  });

test("tla-ts finds that the SDK's roving step after the kernel moves focus where the roving list says, for every list of up to four tabs, every starting tab and every move", () => {
  expect(run.status, run.output).toBe(0);
  expect(steps.length, "the model's graph has a step for every list, tab and move").toBe(
    run.graph?.states.size === undefined ? 0 : run.graph.states.size / 2,
  );
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
