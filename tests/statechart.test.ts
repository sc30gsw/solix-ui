import { expect, test } from "vite-plus/test";
import { chartOf, statechartOf } from "#/scripts/statechart.ts";
import { runModel } from "#/tests/support/formal-graph.ts";

const counter = [
  "let count = 0;",
  "",
  "export const up = () => {",
  "  if (count >= 3) return;",
  "  count += 1;",
  "};",
  "",
  "export const reset = () => {",
  "  if (count === 0) return;",
  "  count = 0;",
  "};",
  "",
  "export const belowTwo = () => count < 2;",
  "",
  "export const belowFour = () => count < 4;",
  "",
  "export const belowThree = () => count < 3;",
  "",
].join("\n");
const model = "counter.model.ts";
const view = {
  title: "A counter",
  state: ({ count }: { count?: unknown }) => `at ${String(count)}`,
  step: (action: string) => (action === "up" ? "you count up" : "you reset"),
};

test("the statechart of a model reports the shortest path to each rule that breaks, in the view's words, and the rules that hold", () => {
  const { report, broken } = statechartOf(model, view, 10, { source: counter });

  expect(broken.map(({ rule, trace }) => ({ rule, steps: trace.length - 1 }))).toEqual([
    { rule: "belowTwo", steps: 2 },
    { rule: "belowThree", steps: 3 },
  ]);
  expect(report).toContain(
    [
      "## belowTwo breaks",
      "",
      "The invariant breaks on the shortest path, of 2 steps:",
      "",
      "0. at 0",
      "1. you count up: at 1",
      "2. you count up: at 2",
    ].join("\n"),
  );
  expect(report).toContain("## Rules that hold\n\nbelowFour\n");
});

test("the chart draws each state the view names once, an arrow for each step between two of them, and marks where a rule breaks", () => {
  const { chart } = statechartOf(model, view, 10, { source: counter });

  expect(chart).toBe(
    [
      "---",
      "title: A counter",
      "---",
      "stateDiagram-v2",
      "  direction LR",
      "  s0: at 0",
      "  s1: at 1",
      "  s2: at 2",
      "  s3: at 3",
      "  [*] --> s0",
      "  s0 --> s1: you count up",
      "  s1 --> s2: you count up",
      "  s1 --> s0: you reset",
      "  s2 --> s3: you count up",
      "  s2 --> s0: you reset",
      "  s3 --> s0: you reset",
      "  classDef breaks fill:#fde8e8,stroke:#c81e1e,stroke-width:2.5px,color:#9b1c1c",
      "  class s2 breaks",
      "  class s3 breaks",
      "  classDef bugPath stroke:#c81e1e,stroke-dasharray:4 3",
      "  class s0 bugPath",
      "  class s1 bugPath",
      "",
    ].join("\n"),
  );
});

test("a temporal property that breaks reports the behaviour that never reaches its target", () => {
  const unanswered = [
    "let asked = false;",
    "",
    "export const ask = () => {",
    "  if (asked) return;",
    "  asked = true;",
    "};",
    "",
    "export const answer = () => {",
    "  if (!asked) return;",
    "  asked = false;",
    "};",
    "",
    "const isAnswered = () => !asked;",
    "",
    "/** @leadsTo isAnswered */",
    "export const everyQuestionIsAnswered = () => asked;",
    "",
  ].join("\n");
  const { report } = statechartOf("unanswered.model.ts", {}, 10, { source: unanswered });

  expect(report).toContain(
    [
      "## everyQuestionIsAnswered breaks",
      "",
      "The temporal property breaks on this behaviour, of 2 steps:",
      "",
      "0. asked = FALSE",
      "1. ask: asked = TRUE",
      "2. nothing more happens, ever",
    ].join("\n"),
  );
});

test("a chart with more states than its cap is refused, saying how many it would draw and what to do", () => {
  const { graph } = runModel(model, {
    dump: true,
    source: counter.replace(/export const below\w+ = .*\n/g, ""),
  });
  if (graph === undefined) throw new Error("tla-ts dumped no graph of the counter.");

  expect(() => chartOf(graph, view, [], 3)).toThrow(
    "The chart would draw 4 states, more than its cap of 3. Give a view whose state() merges states that act the same or whose keep() draws fewer, or raise --max-states.",
  );
});
