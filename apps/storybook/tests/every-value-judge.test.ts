import { expect, test } from "vite-plus/test";
import {
  type AlikeGroup,
  type Because,
  describeBecause,
  type JudgedValues,
  judgeEveryValue,
  type ProblemKind,
} from "#/every-value-judge.ts";

const look = (...declarations: string[]) => [declarations];
const red = look("color:red");
const blue = look("color:blue");
const green = look("color:green");

function judged(changes: Partial<JudgedValues>): JudgedValues {
  return {
    prop: "tone",
    values: ["a", "b"],
    observe: "the look",
    observed: [red, blue],
    viewport: undefined,
    alike: [],
    surroundings: { engine: "chromium", scheme: "light", systemScheme: "light", width: 1200 },
    ...changes,
  };
}

function kindsOf(changes: Partial<JudgedValues>): ProblemKind[] {
  return judgeEveryValue(judged(changes)).map(({ kind }) => kind);
}

const open: Because = { kind: "openUntil", followUp: "a fix" };
const both = (because: Because): AlikeGroup[] => [{ values: ["a", "b"], because }];
const dark: Because = { kind: "scheme", scheme: "dark", reason: "it hides nothing there" };
const systemDark: Because = { kind: "systemScheme", scheme: "dark", reason: "auto follows it" };
const atTheViewport: Because = { kind: "viewport", reason: "both breakpoints lie below it" };
const byDesign: Because = { kind: "design", reason: "one differs only while hovered" };
const inFirefox: Because = {
  kind: "engine",
  engines: ["firefox"],
  reason: "it reads one as the other",
};

test("values that look different pass, and values that look alike fail unless a group in force declares them alike", () => {
  expect(kindsOf({})).toEqual([]);
  expect(kindsOf({ observed: [red, red] })).toEqual(["alike"]);
  expect(kindsOf({ observed: [red, red], alike: both(open) })).toEqual([]);
});

test("a group that is in force while the values look different is no longer needed, for every kind of reason", () => {
  for (const because of [open, byDesign, dark, systemDark, atTheViewport]) {
    expect(
      kindsOf({
        alike: both(because),
        viewport: 1200,
        surroundings: { engine: "chromium", scheme: "dark", systemScheme: "dark", width: 1200 },
      }),
      describeBecause(because),
    ).toEqual(["noLongerNeeded"]);
  }
});

test("a scheme or system-scheme group is in force only in its scheme, so it neither excuses alike values nor goes stale outside it", () => {
  for (const because of [dark, systemDark]) {
    expect(kindsOf({ observed: [red, red], alike: both(because) })).toEqual(["alike"]);
    expect(kindsOf({ alike: both(because) })).toEqual([]);
    const inDark = {
      engine: "chromium",
      scheme: "dark",
      systemScheme: "dark",
      width: 1200,
    } as const;
    expect(kindsOf({ observed: [red, red], alike: both(because), surroundings: inDark })).toEqual(
      [],
    );
  }
});

test("a story that sets a viewport fails on a page of another width, and a viewport group needs the viewport option", () => {
  expect(kindsOf({ viewport: 700 })).toEqual(["viewport"]);
  expect(kindsOf({ viewport: 1200 })).toEqual([]);
  expect(kindsOf({ observed: [red, red], alike: both(atTheViewport) })).toEqual([
    "viewportWithoutViewport",
  ]);
  expect(kindsOf({ observed: [red, red], alike: both(atTheViewport), viewport: 1200 })).toEqual([]);
});

test("a group that names a value the story does not show fails with its own message", () => {
  const problems = judgeEveryValue(
    judged({ observed: [red, red], alike: [{ values: ["a", "b", "c"], because: open }] }),
  );
  expect(problems.map(({ kind }) => kind)).toEqual(["notAnOption"]);
  expect(problems[0]?.message).toContain(
    "declares c alike, but it is not among the values it shows: a, b",
  );
});

test("groups of several kinds combine: each pair needs one group in force, and each group in force must still be needed", () => {
  const values = ["a", "b", "c", "d"];
  const surroundings = {
    engine: "chromium",
    scheme: "dark",
    systemScheme: "light",
    width: 900,
  } as const;
  const alike: AlikeGroup[] = [
    { values: ["a", "b"], because: open },
    { values: ["c", "d"], because: dark },
    { values: ["b", "c"], because: systemDark },
  ];
  expect(
    kindsOf({ values, observed: [red, red, blue, blue], alike, surroundings, viewport: 900 }),
  ).toEqual([]);
  expect(
    kindsOf({ values, observed: [red, red, red, red], alike, surroundings, viewport: 900 }),
  ).toEqual(["alike"]);
  expect(
    kindsOf({ values, observed: [red, blue, green, green], alike, surroundings, viewport: 900 }),
  ).toEqual(["noLongerNeeded"]);
});

test("an observation other than the look is judged the same way, so a stale group is still flagged", () => {
  const effect = { observe: "the scheme its script sets" };
  expect(kindsOf({ ...effect, observed: [look("dark"), look("light")] })).toEqual([]);
  expect(kindsOf({ ...effect, observed: [look("dark"), look("dark")] })).toEqual(["alike"]);
  expect(
    kindsOf({ ...effect, observed: [look("dark"), look("light")], alike: both(open) }),
  ).toEqual(["noLongerNeeded"]);
});

test("the look is compared element by element, so declarations that join into the same text still differ", () => {
  expect(kindsOf({ observed: [[["a:1", "b:2"]], [["a:1"], ["b:2"]]] })).toEqual([]);
});

test("a story that renders fewer values than it shows fails on the count alone", () => {
  expect(kindsOf({ observed: [red] })).toEqual(["count"]);
});

test("an engine group is in force only in the engines it names, and a design group everywhere", () => {
  const inEngine = (engine: "chromium" | "firefox" | "webkit") =>
    ({ engine, scheme: "light", systemScheme: "light", width: 1200 }) as const;
  expect(kindsOf({ observed: [red, red], alike: both(inFirefox) })).toEqual(["alike"]);
  expect(
    kindsOf({ observed: [red, red], alike: both(inFirefox), surroundings: inEngine("firefox") }),
  ).toEqual([]);
  expect(kindsOf({ alike: both(inFirefox) })).toEqual([]);
  expect(kindsOf({ alike: both(inFirefox), surroundings: inEngine("firefox") })).toEqual([
    "noLongerNeeded",
  ]);
  for (const engine of ["chromium", "firefox", "webkit"] as const) {
    expect(
      kindsOf({ observed: [red, red], alike: both(byDesign), surroundings: inEngine(engine) }),
    ).toEqual([]);
  }
});

test("groups in force join their values, so two groups that share a value cover the pair they do not name together", () => {
  const values = ["a", "b", "c"];
  const chained: AlikeGroup[] = [
    { values: ["a", "b"], because: byDesign },
    { values: ["b", "c"], because: open },
  ];
  expect(kindsOf({ values, observed: [red, red, red], alike: chained })).toEqual([]);
  expect(
    kindsOf({
      values,
      observed: [red, red, red],
      alike: [chained[0], { ...chained[1], because: dark }],
    }),
  ).toEqual(["alike"]);
});
