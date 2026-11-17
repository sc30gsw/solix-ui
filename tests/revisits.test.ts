import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import type { RegistryDocument, ReleasePolicy } from "#/scripts/newest-releases.ts";
import { repositoryRoot } from "#/scripts/repository.ts";
import {
  evaluateRevisits,
  parseRevisits,
  readRevisits,
  type Revisit,
  revisitTable,
  revisitsWithoutReasonOrCondition,
} from "#/scripts/revisits.ts";
import { roadmapFile } from "#/scripts/roadmap.ts";
import { expectScheduledJobToRun } from "#/tests/support/weekly-workflow.ts";

const fixtureFile = "tests/fixtures/registry/2026-11-16.json";
const revisitJob = "revisits";
const revisitCheck = "node scripts/check-revisits.ts";
const now = Date.parse("2026-11-16T22:39:45Z");
const policy: ReleasePolicy = { minimumReleaseAgeMinutes: 24 * 60, excluded: [] };

const registryFixture = JSON.parse(
  readFileSync(join(repositoryRoot, fixtureFile), "utf8"),
) as Record<string, RegistryDocument>;

const reactiveScript: Revisit = {
  name: "ReactiveScript",
  reason: "It is experimental.",
  condition: [
    { name: "solid-js", range: "^2.0.0" },
    { name: "@reactivescript/compiler", range: ">=1.0.0" },
  ],
};

const revisitText = [
  "## Revisits",
  "",
  "### Thing",
  "",
  "- Why not now: It is new.",
  "- Condition: a stable release old enough to install under the repository's `minimumReleaseAge` exists for `thing@>=1.0.0` and `@scope/other@^2.0.0`.",
  "",
].join("\n");

function withRelease(name: string, version: string, at: string): Record<string, RegistryDocument> {
  const document = registryFixture[name];
  return {
    ...registryFixture,
    [name]: {
      versions: { ...document.versions, [version]: {} },
      time: { ...document.time, [version]: at },
    },
  };
}

function withLine(text: string, from: string, to: string): string {
  expect(text).toContain(from);
  return text.replace(from, to);
}

function evaluated(documents: Record<string, RegistryDocument>, revisits = [reactiveScript]) {
  return evaluateRevisits({ revisits, documents, policy, now });
}

function statuses(documents: Record<string, RegistryDocument>): string[] {
  return evaluated(documents).evaluations.flatMap(({ requirements }) =>
    requirements.map(({ status }) => status),
  );
}

const stableSolid = withRelease("solid-js", "2.0.0", "2026-11-12T00:00:00Z");
const reactiveScriptOne = withRelease("@reactivescript/compiler", "1.0.0", "2026-11-14T00:00:00Z");
const both = {
  ...stableSolid,
  "@reactivescript/compiler": reactiveScriptOne["@reactivescript/compiler"],
};
const bothButYoung = {
  ...stableSolid,
  "@reactivescript/compiler": withRelease(
    "@reactivescript/compiler",
    "1.0.0",
    "2026-11-16T20:00:00Z",
  )["@reactivescript/compiler"],
};

test(`every revisit in ${roadmapFile} has a reason and one condition`, () => {
  const revisits = readRevisits();

  expect(revisits.length).toBeGreaterThan(0);
  expect(revisitsWithoutReasonOrCondition(revisits)).toEqual([]);
});

test(`no revisit in ${roadmapFile} is met by the registry fixture in ${fixtureFile}, which holds solid-js, @reactivescript/compiler and storybook's releases on majors 10 and 11 as of 2026-11-16`, () => {
  const report = evaluated(registryFixture, readRevisits());

  expect(report.problems).toEqual([]);
});

test(`the scheduled workflow runs the revisit check in a ${revisitJob} job with no if, no continue-on-error and a timeout`, () => {
  expectScheduledJobToRun(revisitJob, revisitCheck);
});

test("the revisits read the reason and the condition of each revisit", () => {
  expect(parseRevisits(revisitText)).toEqual([
    {
      name: "Thing",
      reason: "It is new.",
      condition: [
        { name: "thing", range: ">=1.0.0" },
        { name: "@scope/other", range: "^2.0.0" },
      ],
    },
  ]);
});

test("the revisits refuse a condition they cannot read, a second condition line and a condition line outside a revisit", () => {
  const condition = revisitText.split("\n")[5];

  expect(() => parseRevisits(withLine(revisitText, "`thing@>=1.0.0`", "`thing@newest`"))).toThrow(
    `${roadmapFile}:6: write the condition of Thing as`,
  );
  expect(() =>
    parseRevisits(withLine(revisitText, "- Condition: a stable", "- Condition: once a stable")),
  ).toThrow(`${roadmapFile}:6: write the condition of Thing as`);
  expect(() => parseRevisits(`${revisitText}${condition}\n`)).toThrow(
    `${roadmapFile}:6 and ${roadmapFile}:7: Thing has 2 condition lines. Write one.`,
  );
  expect(() =>
    parseRevisits(withLine(revisitText, "### Thing\n", `${condition}\n### Thing\n`)),
  ).toThrow(`${roadmapFile}:3: a condition belongs to one revisit.`);
  expect(() => parseRevisits(`## v1.0\n\n${condition}\n\n${revisitText}`)).toThrow(
    `${roadmapFile}:3: a condition belongs to one revisit.`,
  );
});

test("a revisit with no condition line or no reason is reported", () => {
  const revisits = parseRevisits(
    withLine(withLine(revisitText, "- Why not now: It is new.\n", ""), "- Condition:", "- Note:"),
  );

  expect(revisits).toEqual([{ name: "Thing", reason: "", condition: [] }]);
  expect(revisitsWithoutReasonOrCondition(revisits)).toEqual([
    `${roadmapFile}: give the revisit Thing a "- Why not now:" reason and a "- Condition:" the weekly check can evaluate.`,
  ]);
});

test("without a stable Solid 2, the condition is not met, though ReactiveScript is at 1.0", () => {
  const documents = { ...registryFixture, ...reactiveScriptOne };
  const report = evaluated(documents);

  expect(report.evaluations[0].met).toBe(false);
  expect(statuses(documents)).toEqual(["not published", "met"]);
  expect(report.problems).toEqual([]);
  expect(revisitTable(report.evaluations)).toContain(
    "| ReactiveScript | solid-js@^2.0.0 | no stable release in range; the newest is 2.0.0-rc.23 |",
  );
});

test("with ReactiveScript below 1.0, the condition is not met, though Solid 2 is stable", () => {
  const report = evaluated(stableSolid);

  expect(report.evaluations[0].met).toBe(false);
  expect(statuses(stableSolid)).toEqual(["met", "not published"]);
  expect(report.problems).toEqual([]);
});

test("a release that meets the condition but is younger than minimumReleaseAge does not meet it yet", () => {
  const report = evaluated(bothButYoung);

  expect(report.evaluations[0].met).toBe(false);
  expect(report.evaluations[0].requirements[1]).toEqual({
    requirement: reactiveScript.condition[1],
    status: "too young",
    version: "1.0.0",
    eligibleAt: "2026-11-17T20:00:00.000Z",
  });
  expect(report.problems).toEqual([]);
});

test("once every release the condition names is stable and old enough to install, the check fails and names the revisit", () => {
  const report = evaluated(both);

  expect(report.evaluations[0].met).toBe(true);
  expect(report.problems).toEqual([
    `ReactiveScript: its condition in ${roadmapFile} is met by solid-js@2.0.0, @reactivescript/compiler@1.0.0. Decide on the revisit: take it up, or give it a new condition.`,
  ]);
});

test("a young release that minimumReleaseAgeExclude names counts as old enough", () => {
  const report = evaluateRevisits({
    revisits: [reactiveScript],
    documents: bothButYoung,
    policy: { ...policy, excluded: [{ name: "@reactivescript/compiler", version: "1.0.0" }] },
    now,
  });

  expect(report.evaluations[0].met).toBe(true);
});

test("a revisit without a condition or a reason is never met and fails the check, and so do a package with no registry document and a release with no publish time", () => {
  const unexplained: Revisit = { name: "Unexplained", reason: "", condition: [] };
  const elsewhere: Revisit = {
    name: "Elsewhere",
    reason: "Not yet.",
    condition: [{ name: "not-in-the-fixture", range: ">=1.0.0" }],
  };
  const timeless = { ...registryFixture, "solid-js": { versions: { "2.0.0": {} }, time: {} } };

  expect(evaluated(registryFixture, [unexplained]).evaluations[0].met).toBe(false);
  expect(evaluated(registryFixture, [unexplained]).problems).toEqual([
    `${roadmapFile}: give the revisit Unexplained a "- Why not now:" reason and a "- Condition:" the weekly check can evaluate.`,
  ]);
  expect(evaluated(registryFixture, [elsewhere]).problems).toEqual([
    "Elsewhere: the registry answer holds no document for not-in-the-fixture, so nothing tells whether it is published.",
  ]);
  expect(evaluated(timeless).problems).toEqual([
    "ReactiveScript: the registry gives no publish time for solid-js@2.0.0, so its age cannot be told.",
  ]);
});
