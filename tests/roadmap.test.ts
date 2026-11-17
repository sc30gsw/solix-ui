import { expect, inject, test } from "vite-plus/test";
import { builtComponents, library } from "#/packages/core/tests/built-library.ts";
import {
  type Built,
  carriersIn,
  type ConditionState,
  conditionProblems,
  conditionStateIn,
  parseRoadmap,
  readRoadmap,
  roadmapFile,
  roadmapProblems,
} from "#/scripts/roadmap.ts";

const builtByName: Record<string, unknown> = library;

const fixture = [
  "## v1.0",
  "",
  "1. **Gadgets** (merged): Gadget and Gizmo.",
  "2. **Widgets** (in progress): Widget, Sprocket.",
  "3. **Docs** (not started).",
  "",
  "### Leaving",
  "",
  "- **Doohickey** will leave once Widget is in the built library.",
  "",
  "### Packages",
  "",
  "- `@solix/thing`.",
  "",
].join("\n");

function withLine(text: string, from: string, to: string): string {
  expect(text).toContain(from);
  return text.replace(from, to);
}

function stubLibrary(): Record<string, unknown> {
  function Gadget(): void {}
  function GadgetCol(): void {}
  function Widget(): void {}
  Object.assign(Gadget, { Col: GadgetCol });
  return { Gadget, GadgetCol, Widget };
}

test(`${roadmapFile} places every component of the built library once, in a step, as leaving or with the component that carries it, and every component of a step marked merged is built`, () => {
  const roadmap = readRoadmap();
  const built: Built = {
    components: builtComponents,
    carriedBy: carriersIn(builtByName, builtComponents),
  };

  expect(roadmap.steps.length).toBeGreaterThan(0);
  expect(built.components.length).toBeGreaterThan(0);
  expect(roadmapProblems(roadmap, built)).toEqual([]);
});

test("the roadmap reads steps, statuses and leaving components", () => {
  expect(parseRoadmap(fixture)).toEqual({
    steps: [
      { name: "Gadgets", status: "merged", components: ["Gadget", "Gizmo"] },
      { name: "Widgets", status: "in progress", components: ["Widget", "Sprocket"] },
      { name: "Docs", status: "not started", components: [] },
    ],
    leaving: [{ component: "Doohickey", replacedBy: ["Widget"] }],
  });
});

test("a component carried as a static member of another, by identity, goes with that one's step", () => {
  const stub = stubLibrary();
  const names = Object.keys(stub);
  const built: Built = { components: names, carriedBy: carriersIn(stub, names) };
  const roadmap = parseRoadmap("## v1.0\n\n1. **Gadgets** (merged): Gadget, Widget.\n");

  expect(built.carriedBy).toEqual({ GadgetCol: "Gadget" });
  expect(roadmapProblems(roadmap, built)).toEqual([]);
  expect(
    roadmapProblems(
      parseRoadmap("## v1.0\n\n1. **Gadgets** (merged): Gadget, GadgetCol, Widget.\n"),
      built,
    ),
  ).toEqual([
    `${roadmapFile}: the built library carries GadgetCol as a static member of Gadget, so it goes with Gadget. Remove it from the roadmap.`,
  ]);
  expect(
    roadmapProblems(parseRoadmap("## v1.0\n\n1. **Gadgets** (merged): Widget.\n"), built),
  ).toEqual([
    `${roadmapFile}: the built library exports Gadget, which no step lists. Add it to the step it belongs to, or list it as leaving.`,
  ]);
});

test("a merged step missing a component, a component in no step, and a leaving component whose replacements are built each fail", () => {
  const problems = roadmapProblems(parseRoadmap(fixture), {
    components: ["Doohickey", "Gadget", "Thingamajig", "Widget"],
    carriedBy: {},
  });

  expect(problems).toEqual([
    `${roadmapFile}: Gadgets is marked merged, but the built library does not export Gizmo. Mark it in progress, or land them.`,
    `${roadmapFile}: the built library exports Thingamajig, which no step lists. Add it to the step it belongs to, or list it as leaving.`,
    `${roadmapFile}: Widget is in the built library, so Doohickey leaves now. Remove it from the library and from Leaving.`,
  ]);
});

test("a leaving component that is gone, or whose replacement no step plans, fails", () => {
  const roadmap = parseRoadmap(
    withLine(
      fixture,
      "- **Doohickey** will leave once Widget is in the built library.",
      "- **Doohickey** will leave once Whatsit is in the built library.",
    ),
  );

  expect(roadmapProblems(roadmap, { components: ["Gadget", "Gizmo"], carriedBy: {} })).toEqual([
    `${roadmapFile}: Doohickey is listed as leaving, but the built library no longer exports it. Remove it from Leaving.`,
    `${roadmapFile}: Doohickey is replaced by Whatsit, which no step lists. Add them to a step.`,
  ]);
});

test("the roadmap refuses every step, leaving or duplicate line it cannot read, by line number, instead of passing over it", () => {
  const refusals: [string, string, string][] = [
    ["**Docs** (not started)", "**Docs** (Merged)", ':5: Docs has the status "Merged".'],
    ["**Docs** (not started)", "**Docs** (merged)", ":5: Docs adds no component"],
    ["Widget, Sprocket.", "Widget, sprocket.", ':4: "sprocket" is not a component name.'],
    ["3. **Docs**", "4. **Docs**", ":5: number the steps in order; this one is 3."],
    ["3. **Docs** (not started).", "- **Docs** (merged): Whatsit.", ":5: write a step"],
    ["- `@solix/thing`.", "1. **Extras** (merged): Whatsit.", ":13: write a step"],
    ["- `@solix/thing`.", "- **Extras** (merged): Whatsit.", ":13: write a step"],
    [
      "**Doohickey** will",
      "**Doohickey and Gadget** will",
      ":9: a leaving entry names exactly one",
    ],
    ["**Doohickey** will leave", "**Doohickey** leaves", ":9: write a leaving component"],
    ["Widget, Sprocket.", "Widget, Widget.", ":4 and ROADMAP.md:4: Widget is placed twice."],
    ["Widget, Sprocket.", "Gadget, Sprocket.", ":3 and ROADMAP.md:4: Gadget is placed twice."],
    ["**Doohickey** will", "**Sprocket** will", ":4 and ROADMAP.md:9: Sprocket is placed twice."],
  ];

  for (const [from, to, refusal] of refusals) {
    expect(() => parseRoadmap(withLine(fixture, from, to)), to).toThrow(`${roadmapFile}${refusal}`);
  }
  expect(() =>
    parseRoadmap(
      withLine(
        fixture,
        "- **Doohickey** will leave once Widget is in the built library.",
        "- **Doohickey** will leave once Widget is in the built library.\n- **Doohickey** will leave once Gizmo is in the built library.",
      ),
    ),
  ).toThrow(`${roadmapFile}:9 and ${roadmapFile}:10: Doohickey is placed twice.`);
});

const withCondition = [
  "## v1.0",
  "",
  "1. **Gadgets** (merged): Gadget.",
  "2. **Tooling** (merged).",
  "   - Merged when: `tests/tooling.test.ts` exists and `vp run verify` runs it.",
  "3. **Docs** (not started).",
  "   - Merged when: `tests/docs.test.ts` exists and `vp run verify` runs it.",
  "",
].join("\n");

function statesOf(states: Readonly<Record<string, ConditionState>>) {
  return (file: string): ConditionState => states[file] ?? "missing";
}

test(`every step of ${roadmapFile} that adds no component and is merged names its test, and every condition says the truth about the files the test runner lists for vp run verify`, () => {
  const { steps } = readRoadmap();

  expect(steps.filter(({ mergedWhen }) => mergedWhen !== undefined).length).toBeGreaterThan(0);
  expect(conditionProblems(steps, conditionStateIn(inject("testFilesOfEachProject")))).toEqual([]);
});

test("a condition's test is missing when no file has its path, not run when no project the runner lists runs it, and run otherwise", () => {
  const stateOf = conditionStateIn({ node: ["tests/roadmap.test.ts"], other: [] });

  expect(stateOf("tests/roadmap.test.ts")).toBe("run");
  expect(stateOf(roadmapFile)).toBe("not run");
  expect(stateOf("tests/no-such.test.ts")).toBe("missing");
});

test("a step that adds no component reads the condition on the line under it", () => {
  expect(parseRoadmap(withCondition).steps).toEqual([
    { name: "Gadgets", status: "merged", components: ["Gadget"] },
    {
      name: "Tooling",
      status: "merged",
      components: [],
      mergedWhen: "tests/tooling.test.ts",
    },
    { name: "Docs", status: "not started", components: [], mergedWhen: "tests/docs.test.ts" },
  ]);
});

test("a step says merged exactly when its condition's test exists and verify runs it", () => {
  const { steps } = parseRoadmap(withCondition);

  expect(conditionProblems(steps, statesOf({ "tests/tooling.test.ts": "run" }))).toEqual([]);
  expect(conditionProblems(steps, statesOf({}))).toEqual([
    `${roadmapFile}: Tooling is marked merged, but tests/tooling.test.ts does not exist. Mark it in progress, or land it.`,
  ]);
  expect(conditionProblems(steps, statesOf({ "tests/tooling.test.ts": "not run" }))).toEqual([
    `${roadmapFile}: Tooling is marked merged, but tests/tooling.test.ts is not a file \`vp run verify\` runs. Mark it in progress, or land it.`,
  ]);
  expect(
    conditionProblems(
      steps,
      statesOf({ "tests/tooling.test.ts": "run", "tests/docs.test.ts": "run" }),
    ),
  ).toEqual([
    `${roadmapFile}: Docs is marked not started, but tests/docs.test.ts exists and \`vp run verify\` runs it. Mark it merged.`,
  ]);
});

test("the roadmap refuses every condition it cannot read, or that has no step right above it or decides a step with components, by line number", () => {
  const refusals: [string, string, string][] = [
    [
      "   - Merged when: `tests/tooling.test.ts` exists and `vp run verify` runs it.",
      "   - Merged when: tests/tooling.test.ts exists.",
      ":5: write the condition as",
    ],
    [
      "   - Merged when: `tests/tooling.test.ts` exists and `vp run verify` runs it.",
      "- Merged when: `tests/tooling.test.ts` exists and `vp run verify` runs it.",
      ":5: write the condition as",
    ],
    [
      "2. **Tooling** (merged).\n",
      "2. **Tooling** (merged).\n\n",
      ":6: a condition goes on the line right under its step.",
    ],
    [
      "1. **Gadgets** (merged): Gadget.",
      "1. **Gadgets** (merged): Gadget.\n   - Merged when: `tests/gadget.test.ts` exists and `vp run verify` runs it.",
      ":4: Gadgets adds components",
    ],
    [
      "   - Merged when: `tests/tooling.test.ts` exists and `vp run verify` runs it.\n",
      "",
      ":4: Tooling adds no component, so give it the condition",
    ],
  ];

  for (const [from, to, refusal] of refusals) {
    expect(() => parseRoadmap(withLine(withCondition, from, to)), to).toThrow(
      `${roadmapFile}${refusal}`,
    );
  }
});
