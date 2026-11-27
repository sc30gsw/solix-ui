import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import {
  compareWithNewest,
  failureLines,
  heldBackFrom,
  mayChangePins,
  exactlyRequiredBy,
  type HeldBack,
  heldBackFile,
  holdsOfNothing,
  holdsWithoutReason,
  type NodeRelease,
  nodePinName,
  packageManagerPinName,
  type Pin,
  pinsOf,
  prereleasePinsOnlyNamedBy,
  type RegistryDocument,
  verdictOf,
  warningLines,
} from "#/scripts/newest-releases.ts";
import { pnpmSettings, workspaceFile } from "#/scripts/pnpm-settings.ts";
import {
  heldBackEntries,
  releasePolicy,
  storybookAppManifest,
  untilStableMembers,
} from "#/scripts/release-sources.ts";
import { manifestAt, manifestPaths, repositoryRoot, rootManifest } from "#/scripts/repository.ts";
import { importsOf, parse } from "#/scripts/syntax.ts";
import { type Listing, now, policy, registryDocument } from "#/tests/support/registry-fixtures.ts";
import {
  cronProblems,
  expectEveryJobToRunWeeklyAndFailTheRun,
  weeklyWorkflow,
} from "#/tests/support/weekly-workflow.ts";
import { newestReleasesCheck } from "#/tests/support/release-checks.ts";
import { gateJobProblems, workflowAt } from "#/tests/support/workflows.ts";

const manifest = { packageManager: "pnpm@12.18.0", engines: { node: "^26.13.1" } };

const documents = {
  semver: registryDocument([
    ["7.8.5", 30],
    ["7.8.6", 10],
    ["7.8.7", 0.25],
  ]),
  playwright: registryDocument([
    ["1.63.0", 60],
    ["1.65.1", 2],
    ["1.66.0-alpha.1", 1.5],
  ]),
  "solid-js": registryDocument([
    ["1.9.19", 90],
    ["2.0.0-rc.23", 30],
    ["2.0.0", 20],
    ["2.0.1", 3],
    ["2.1.0-rc.1", 2],
  ]),
  "@solidjs/vite-plugin": registryDocument([
    ["3.0.0-next.57", 30],
    ["3.0.0", 20],
    ["3.0.1", 4],
    ["3.1.0-next.0", 3],
    ["4.0.0", 4],
  ]),
  "@types/node": registryDocument([
    ["26.6.6", 20],
    ["26.6.7", 5],
    ["27.0.0", 5],
  ]),
  "@voidzero-dev/vite-plus-core": registryDocument([["1.6.0", 30]], [["1.6.1", 10]]),
  pnpm: registryDocument([["12.18.0", 9]]),
};
const nodeReleases: NodeRelease[] = [
  { version: "v27.0.0-alpha.0.1.0", lts: false },
  { version: "v26.13.2", lts: "Lithium" },
  { version: "v26.13.1", lts: "Lithium" },
];
const pins = pinsOf(manifest, {
  semver: "7.8.6",
  playwright: "^1.63.0",
  "solid-js": "2.0.0",
  "@solidjs/vite-plugin": "3.0.0",
  "@types/node": "^26.6.6",
  vite: "npm:@voidzero-dev/vite-plus-core@1.6.0",
});

type CheckOptions = {
  pins?: Pin[];
  documents?: Record<string, RegistryDocument>;
  nodeReleases?: NodeRelease[];
  heldBack?: HeldBack[];
  untilStablePackages?: string[];
};

function check(options: CheckOptions = {}) {
  const found = report(options);
  return { ...found, problems: found.problems.map(({ message }) => message) };
}

function report(options: CheckOptions = {}) {
  return compareWithNewest({
    pins: options.pins ?? pins,
    documents: options.documents ?? documents,
    nodeReleases: options.nodeReleases ?? nodeReleases,
    policy,
    now,
    heldBack: options.heldBack ?? [],
    untilStablePackages: options.untilStablePackages ?? [],
  });
}

function checkOf(
  name: string,
  pinned: string,
  releases: Listing[],
  untilStablePackages: string[] = [],
) {
  const report = check({
    pins: pinsOf(manifest, { [name]: pinned }),
    documents: { ...documents, [name]: registryDocument(releases) },
    untilStablePackages,
  });
  return { comparison: report.comparisons[0], problems: report.problems };
}

function statuses(options: Parameters<typeof check>[0] = {}): Record<string, string> {
  return Object.fromEntries(
    check(options).comparisons.map(({ pin, status }) => [pin.name, status]),
  );
}

test("each pin is compared with the newest published release on its own channel", () => {
  const newest = Object.fromEntries(
    check().comparisons.map((comparison) => [
      comparison.pin.name,
      comparison.status === "unknown" ? undefined : comparison.newest,
    ]),
  );

  expect(newest).toEqual({
    semver: "7.8.7",
    playwright: "1.65.1",
    "solid-js": "2.0.1",
    "@solidjs/vite-plugin": "3.0.1",
    "@types/node": "26.6.7",
    vite: "1.6.0",
    [packageManagerPinName]: "12.18.0",
    [nodePinName]: "26.13.2",
  });
});

test("a release younger than the minimum release age is not yet eligible, not behind", () => {
  const semver = check().comparisons.find(({ pin }) => pin.name === "semver");

  expect(semver).toMatchObject({
    status: "not yet eligible",
    eligibleAt: "2026-11-15T06:00:00.000Z",
  });
  expect(check().problems.join("\n")).not.toContain("semver");
});

test("releasePolicy takes the minimum release age from the settings, and refuses settings that set none", () => {
  expect(releasePolicy({ ...pnpmSettings(), minimumReleaseAge: 99 })).toEqual({
    minimumReleaseAgeMinutes: 99,
  });
  expect(() => releasePolicy({ ...pnpmSettings(), minimumReleaseAge: undefined })).toThrow(
    /set minimumReleaseAge/,
  );
  expect(() => releasePolicy(pnpmSettings())).not.toThrow();
});

test("each channel finds what is behind: stable, the stable Solid 2 line, the plugin's stable releases on its pinned major, the Node LTS major and Node's newest LTS", () => {
  expect(statuses()).toEqual({
    semver: "not yet eligible",
    playwright: "behind",
    "solid-js": "behind",
    "@solidjs/vite-plugin": "behind",
    "@types/node": "behind",
    vite: "current",
    [packageManagerPinName]: "current",
    [nodePinName]: "behind",
  });
});

test("the Solid 2 line takes only stable 2.x releases: never a prerelease, and never a Solid 3 release", () => {
  const releases: Listing[] = [
    ["2.0.0", 30],
    ["2.0.1", 10],
    ["2.1.0-rc.1", 5],
    ["3.0.0", 5],
  ];
  const noNewerStable: Listing[] = [
    ["2.0.0", 30],
    ["2.1.0-rc.1", 5],
    ["3.0.0-alpha.1", 5],
  ];

  expect(checkOf("solid-js", "2.0.0", releases).comparison).toMatchObject({
    status: "behind",
    newest: "2.0.1",
    eligible: "2.0.1",
  });
  expect(checkOf("solid-js", "2.0.0", noNewerStable).comparison).toMatchObject({
    status: "current",
    newest: "2.0.0",
  });
});

test("a prerelease pin with no channel of its own is behind a newer prerelease of the version it pins that carries the pin's own identifier, and behind that version once it is stable", () => {
  const betas: Listing[] = [
    ["0.9.0", 99],
    ["1.0.0-beta.3", 50],
    ["1.0.0-beta.9", 20],
    ["1.0.0-canary.12", 15],
    ["1.1.0-beta.1", 10],
  ];

  expect(checkOf("a-package", "1.0.0-beta.3", betas).comparison).toMatchObject({
    status: "behind",
    eligible: "1.0.0-beta.9",
  });
  expect(checkOf("a-package", "1.0.0-beta.9", betas).comparison).toMatchObject({
    status: "current",
  });
  expect(checkOf("a-package", "1.0.0-beta.9", [...betas, ["1.0.0", 5]]).comparison).toMatchObject({
    status: "behind",
    eligible: "1.0.0",
  });
  expect(checkOf("a-package", "0.9.0", betas).comparison).toMatchObject({ status: "current" });
});

test("a prerelease pin of a package with no stable release yet is behind its newest prerelease of any version that carries the pin's own identifier, and takes its channel back once a stable release is published", () => {
  const neverStable: Listing[] = [
    ["2.9.0-stage", 9],
    ["3.0.0-beta.3", 6],
    ["3.0.0-beta.7", 5],
    ["3.0.0-canary.1", 4],
    ["3.1.0-beta.1", 3],
    ["3.1.0-canary.4", 3],
    ["3.1.0-beta.2", 0.25],
  ];

  expect(checkOf("a-package", "3.0.0-beta.7", neverStable).comparison).toMatchObject({
    status: "behind",
    eligible: "3.1.0-beta.1",
    newest: "3.1.0-beta.2",
  });
  expect(checkOf("a-package", "3.1.0-beta.1", neverStable).comparison).toMatchObject({
    status: "not yet eligible",
  });
  expect(checkOf("a-package", "3.0.0-canary.1", neverStable).comparison).toMatchObject({
    status: "behind",
    eligible: "3.1.0-canary.4",
    newest: "3.1.0-canary.4",
  });
  expect(checkOf("a-package", "2.9.0-stage", neverStable).comparison).toMatchObject({
    status: "current",
  });
  expect(
    checkOf("a-package", "3.0.0-beta.7", [...neverStable, ["3.0.0", 2]]).comparison,
  ).toMatchObject({ status: "behind", eligible: "3.0.0", newest: "3.0.0" });
});

test("the prerelease pins only a manifest names are the catalog entries it names whose catalog version is a prerelease and that no other manifest names", () => {
  expect(
    prereleasePinsOnlyNamedBy(
      {
        dependencies: { "a-library": "workspace:*", "a-stable-tool": "catalog:" },
        devDependencies: {
          "a-framework": "catalog:",
          "an-addon": "catalog:",
          "a-shared-beta": "catalog:",
        },
      },
      [{ dependencies: { "a-shared-beta": "catalog:" } }],
      {
        "a-framework": "11.0.0-next-20261020160717",
        "an-addon": "11.0.0-beta.3",
        "a-shared-beta": "0.1.0-beta.5",
        "a-stable-tool": "1.0.0",
        "an-unnamed-beta": "2.0.0-beta.1",
      },
    ),
  ).toEqual(["a-framework", "an-addon"]);
});

test("every member of the until-stable channel that the weekly check uses is named by the Storybook app and by no other workspace manifest, and there is at least one", () => {
  const { catalog } = pnpmSettings();
  const members = untilStableMembers(catalog);
  const app = manifestAt(storybookAppManifest);
  const others = manifestPaths()
    .filter((path) => path !== storybookAppManifest)
    .map(manifestAt);
  const named = (manifest: typeof app) =>
    Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });

  expect(members.length).toBeGreaterThan(0);
  expect(members.filter((name) => !named(app).includes(name))).toEqual([]);
  expect(members.filter((name) => others.some((other) => named(other).includes(name)))).toEqual([]);
});

test("a pin on the until-stable channel is behind the newest release of the major it pins, nightly, beta or release candidate, and follows stable releases once that major has one old enough to install", () => {
  const nightlies: Listing[] = [
    ["10.7.4", 30],
    ["11.0.0-next-20261020160717", 28],
    ["11.0.0-next-20261105190313", 12],
    ["11.0.0-next-20261116090000", 0.5],
    ["12.0.0-next-20261101000000", 10],
  ];
  const beforeStable: Listing[] = [
    ["10.6.7", 7],
    ["11.0.0-beta.3", 4],
    ["11.0.0-rc.0", 2],
    ["11.0.0-rc.1", 0.5],
  ];
  const afterStable: Listing[] = [
    ...beforeStable,
    ["11.0.0", 2],
    ["11.0.1", 0.5],
    ["11.1.0-beta.0", 1.5],
  ];
  const untilStablePackages = ["a-package"];

  expect(
    checkOf("a-package", "11.0.0-next-20261020160717", nightlies, untilStablePackages).comparison,
  ).toMatchObject({
    status: "behind",
    eligible: "11.0.0-next-20261105190313",
    newest: "11.0.0-next-20261116090000",
  });
  expect(
    checkOf("a-package", "11.0.0-next-20261105190313", nightlies, untilStablePackages).comparison,
  ).toMatchObject({ status: "not yet eligible" });
  expect(
    checkOf("a-package", "11.0.0-beta.3", beforeStable, untilStablePackages).comparison,
  ).toMatchObject({ status: "behind", eligible: "11.0.0-rc.0" });
  expect(checkOf("a-package", "11.0.0-beta.3", beforeStable).comparison).toMatchObject({
    status: "current",
  });
  expect(
    checkOf("a-package", "11.0.0-rc.0", afterStable, untilStablePackages).comparison,
  ).toMatchObject({
    status: "behind",
    eligible: "11.0.0",
    newest: "11.0.1",
  });
  expect(checkOf("a-package", "11.0.0", afterStable, untilStablePackages).comparison).toMatchObject(
    {
      status: "not yet eligible",
      newest: "11.0.1",
    },
  );
});

test("a published version with no publish time, or one that is not a date, is a problem that names the package and the version", () => {
  const noTime = registryDocument([["7.8.6", 10]]);
  noTime.versions = { ...noTime.versions, "7.8.7": {} };
  const notADate = registryDocument([["7.8.6", 10]]);
  notADate.time = { ...notADate.time, "7.8.6": "soon" };
  const pinsOfSemver = pinsOf(manifest, { semver: "7.8.6" });

  expect(check({ pins: pinsOfSemver, documents: { ...documents, semver: noTime } })).toMatchObject({
    comparisons: [{ status: "unknown" }, { status: "current" }, { status: "behind" }],
    problems: [
      "semver: the registry gives no publish time for semver@7.8.7, so its age cannot be told.",
      expect.stringContaining(nodePinName),
    ],
  });
  expect(
    check({ pins: pinsOfSemver, documents: { ...documents, semver: notADate } }).problems[0],
  ).toBe("semver: the registry gives no publish time for semver@7.8.6, so its age cannot be told.");
});

test("a Node release index with no LTS release is a problem for engines.node and for @types/node, whose channel follows it", () => {
  const report = check({ nodeReleases: [{ version: "v27.0.0", lts: false }] });

  expect(
    report.comparisons.flatMap(({ pin, status }) => (status === "unknown" ? [pin.name] : [])),
  ).toEqual(["@types/node", nodePinName]);
  expect(report.problems).toContain(`${nodePinName}: Node's release index lists no LTS release.`);
  expect(report.problems).toContain(
    "@types/node: no published release is on its channel (its newest stable release on the major of Node's newest LTS); check the name and the channel.",
  );
});

test("a package the registry has no release of on its channel is a problem that names the channel", () => {
  expect(checkOf("a-package", "1.0.0", []).problems[0]).toBe(
    "a-package: no published release is on its channel (its newest stable release); check the name and the channel.",
  );
});

test("a version the registry lists only in time, unpublished, is not counted", () => {
  const vite = check().comparisons.find(({ pin }) => pin.name === "vite");

  expect(vite).toMatchObject({ status: "current", newest: "1.6.0" });
});

test("a pin behind its channel fails the check, unless the held-back list holds it with a reason and a liftWhen", () => {
  const hold = {
    name: "playwright",
    reason: "The CI image has no browsers for 1.65 yet.",
    liftWhen: "the CI image ships them.",
  };

  expect(check().problems).toContain(
    `playwright: 1.63.0 is behind 1.65.1, the newest release it may move to (its newest stable release). Move to it, or hold it back in ${heldBackFile} with a reason and a liftWhen.`,
  );
  expect(statuses({ heldBack: [hold] }).playwright).toBe("held back");
  expect(
    check({ heldBack: [hold] }).problems.some((problem) => problem.startsWith("playwright:")),
  ).toBe(false);
});

test("a hold that names a condition lasts only while that condition is true: while the pin it names, at the version the catalog pins, requires the named release exactly", () => {
  const hold: HeldBack = {
    name: "playwright",
    reason: "The runner requires playwright-core 1.63.0 exactly.",
    liftWhen: "the runner the catalog pins no longer requires playwright-core 1.63.0 exactly.",
    while: { pin: "semver", requiresExactly: { name: "playwright-core", version: "1.63.0" } },
  };
  const requiring = (version: string) =>
    registryDocument([
      ["7.8.5", 30],
      ["7.8.6", 10, { dependencies: { "playwright-core": version } }],
      ["7.8.7", 0.25],
    ]);
  const held = (version: string) =>
    check({ heldBack: [hold], documents: { ...documents, semver: requiring(version) } }).problems;

  expect(held("1.63.0").filter((problem) => problem.startsWith("playwright:"))).toEqual([]);
  expect(held("1.65.1")).toContain(
    "playwright: it is held back while semver 7.8.6 requires playwright-core 1.63.0 exactly, and semver 7.8.6 no longer does; move playwright and drop or rewrite its entry in scripts/held-back-releases.json.",
  );
  expect(held("^1.63.0")).toContain(
    "playwright: it is held back while semver 7.8.6 requires playwright-core 1.63.0 exactly, and semver 7.8.6 no longer does; move playwright and drop or rewrite its entry in scripts/held-back-releases.json.",
  );
  expect(
    check({
      heldBack: [{ ...hold, while: { ...hold.while, pin: "not-a-pin" } }] as HeldBack[],
    }).problems,
  ).toContain(
    "playwright: its hold names not-a-pin, which is not a pin of the catalog; name a registry pin.",
  );
});

const conditionedHold: HeldBack = {
  name: "playwright",
  reason: "The runner requires playwright-core 1.63.0 exactly.",
  liftWhen: "the runner the catalog pins no longer requires playwright-core 1.63.0 exactly.",
  while: { pin: "semver", requiresExactly: { name: "playwright-core", version: "1.63.0" } },
};

test("each problem has a kind: a pin behind, a pin ahead, a pin whose newest release cannot be told, or a hold", () => {
  const kinds = (options: CheckOptions) =>
    Object.fromEntries(
      report(options).problems.map((problem) => [problem.message.split(":")[0], problem.kind]),
    );

  expect(kinds({})).toMatchObject({ playwright: "behind" });
  expect(kinds({ pins: pinsOf(manifest, { semver: "9.0.0" }) })).toMatchObject({
    semver: "ahead",
  });
  expect(kinds({ nodeReleases: [] })).toMatchObject({ [nodePinName]: "unknown" });
  expect(kinds({ heldBack: [conditionedHold] })).toMatchObject({ playwright: "hold" });
});

const behind = { kind: "behind", message: "playwright: 1.63.0 is behind 1.65.1." } as const;
const holdFailed = { kind: "hold", message: "playwright: its hold no longer applies." } as const;
const onAPullRequest = { GITHUB_EVENT_NAME: "pull_request", GITHUB_BASE_REF: "release-2" };

test("on a pull request, a failing check with a pin behind says that the pin is behind on the base branch the run names too, and that its fix is a build(deps) pull request of its own to it", () => {
  expect(failureLines([behind], onAPullRequest)).toEqual([
    behind.message,
    "On a pull request the check reads the registry as it is now, so a pin it names as behind is behind on release-2 too, unless this pull request moved it.",
    "Move it in a build(deps) pull request of its own to release-2, or hold it back there with a reason, then merge release-2 into this branch.",
  ]);
  expect(failureLines([behind], { GITHUB_EVENT_NAME: "pull_request" }).join("\n")).toContain(
    "behind on main too",
  );
});

test("a failing check adds no pull-request advice when no pin is behind, or when the run is not a pull request", () => {
  expect(failureLines([holdFailed], onAPullRequest)).toEqual([holdFailed.message]);
  expect(failureLines([behind], { ...onAPullRequest, GITHUB_EVENT_NAME: "push" })).toEqual([
    behind.message,
  ]);
  expect(failureLines([behind], {})).toEqual([behind.message]);
});

function scriptsTheCheckImports(): string[] {
  const seen = new Set<string>();
  const pending = ["scripts/check-newest-releases.ts"];
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (seen.has(file)) continue;
    seen.add(file);
    for (const { specifier } of importsOf(parse(join(repositoryRoot, file)))) {
      if (specifier.startsWith("#/scripts/")) pending.push(specifier.slice(2));
    }
  }
  return [...seen].sort();
}

test("a pull request may change the pins when it changes a manifest, the workspace file, the lockfile, the holds, a newest-releases workflow or any script the check imports, and when its files cannot be listed", () => {
  const theCheck = scriptsTheCheckImports();
  expect(theCheck).toContain("scripts/pnpm-settings.ts");
  for (const file of [
    "package.json",
    "apps/storybook/package.json",
    workspaceFile,
    "pnpm-lock.yaml",
    heldBackFile,
    ".github/workflows/newest-releases.yml",
    ".github/workflows/newest-releases-on-pr.yml",
    ...theCheck,
  ]) {
    expect(mayChangePins(["README.md", file]), file).toBe(true);
  }
  expect(mayChangePins(undefined)).toBe(true);
  expect(mayChangePins([])).toBe(false);
  for (const file of [
    "packages/core/src/Button.tsx",
    ".agents/skills/x/SKILL.md",
    ".github/workflows/ci.yml",
    "scripts/newest-releases-helpers.ts",
    "package.json.bak",
  ]) {
    expect(mayChangePins([file]), file).toBe(false);
  }
});

test("on a pull request that changes no pin, a pin behind is a warning and every other problem still fails; with no file list, everything fails", () => {
  const untouched = ["packages/core/src/Button.tsx"];
  expect(verdictOf([behind, holdFailed], untouched)).toEqual({
    failures: [holdFailed],
    warnings: [behind],
  });
  expect(verdictOf([behind], [workspaceFile])).toEqual({ failures: [behind], warnings: [] });
  expect(verdictOf([behind], undefined)).toEqual({ failures: [behind], warnings: [] });
});

test("a pin behind that only warns is a workflow warning that says its fix is a build(deps) pull request of its own to the base branch", () => {
  expect(warningLines([], "release-2")).toEqual([]);
  expect(warningLines([behind], "release-2")).toEqual([
    `::warning::${behind.message}`,
    "::warning::This pull request changes no pin, so a pin behind does not fail it. The fix is a build(deps) pull request of its own to release-2.",
  ]);
});

test(`${heldBackFile} is read against its type, so an entry of the wrong shape fails by its place and its name`, () => {
  const entry = { name: "a-package", reason: "Why.", liftWhen: "When." };

  expect(heldBackFrom([entry])).toEqual([entry]);
  expect(() => heldBackFrom({})).toThrow(`${heldBackFile}: give a list of entries.`);
  expect(() => heldBackFrom([{ ...entry, while: { pin: "vite-plus" } }])).toThrow(
    `${heldBackFile}: entry 1 (a-package): give while a pin and a requiresExactly with a name and a version.`,
  );
  expect(() => heldBackFrom([{ ...entry, reason: 1 }])).toThrow(
    `${heldBackFile}: entry 1 (a-package): give it a name, a reason and a liftWhen, each a string.`,
  );
  expect(() => heldBackFrom([{ ...entry, holds: "sideways" }])).toThrow(
    `${heldBackFile}: entry 1 (a-package): holds is "behind" or "ahead".`,
  );
  expect(() => heldBackFrom([{ ...entry, whlie: {} }])).toThrow(
    `${heldBackFile}: entry 1 (a-package): it sets whlie; an entry sets only name, reason, liftWhen, holds and while.`,
  );
  const condition = { pin: "vite-plus", requiresExactly: { name: "vitest", version: "5.1.0" } };
  expect(() => heldBackFrom([{ ...entry, while: { ...condition, until: "never" } }])).toThrow(
    `${heldBackFile}: entry 1 (a-package): while sets until; it sets only pin and requiresExactly.`,
  );
  expect(() =>
    heldBackFrom([
      {
        ...entry,
        while: { ...condition, requiresExactly: { ...condition.requiresExactly, range: "^5" } },
      },
    ]),
  ).toThrow(
    `${heldBackFile}: entry 1 (a-package): while.requiresExactly sets range; it sets only name and version.`,
  );
});

test("a held-back entry that holds nothing back, or has no reason or no liftWhen, fails the check", () => {
  const idle = { name: "vite", reason: "Waiting.", liftWhen: "it is out." };
  const unexplained = { name: "playwright", reason: "", liftWhen: "" };

  expect(
    holdsOfNothing([idle, unexplained], check({ heldBack: [unexplained] }).comparisons),
  ).toEqual([
    "vite: the held-back list holds it, but it is neither behind nor ahead of its channel; remove the entry.",
  ]);
  expect(holdsWithoutReason([idle, unexplained])).toEqual([
    `playwright: give the entry in ${heldBackFile} a reason, a liftWhen and, for a pin ahead of its channel, holds: "ahead".`,
  ]);
  expect(check({ heldBack: [idle, unexplained] }).problems).toEqual(
    expect.arrayContaining([
      ...holdsOfNothing([idle], check().comparisons),
      ...holdsWithoutReason([unexplained]),
    ]),
  );
});

test("pinsOf refuses a manifest without packageManager or engines.node, and a catalog entry that names no version", () => {
  expect(() => pinsOf({ engines: { node: "^26.13.1" } }, { semver: "7.8.6" })).toThrow(
    "package.json: set packageManager to <name>@<version>.",
  );
  expect(() => pinsOf({ packageManager: "pnpm@12.18.0" }, { semver: "7.8.6" })).toThrow(
    `${nodePinName}: set it to a version or range.`,
  );
  expect(() => pinsOf(manifest, { semver: "newest" })).toThrow(
    'catalog entry semver: "newest" names no version.',
  );
});

test(`${heldBackFile} names only pins of this repository, and holds each back with a reason and a liftWhen`, () => {
  const heldBack = heldBackEntries();
  const names = pinsOf(rootManifest(), pnpmSettings().catalog).map(({ name }) => name);

  expect(heldBack.filter(({ name }) => !names.includes(name))).toEqual([]);
  expect(holdsWithoutReason(heldBack)).toEqual([]);
});

test("every job of the weekly workflow runs each week and fails the run when it fails: a schedule GitHub can run has * for day-of-month and month, and no job sets if, needs or continue-on-error or lacks a timeout", () => {
  expectEveryJobToRunWeeklyAndFailTheRun();
});

test("the pins job is a gate job that runs the pin check: its steps are exactly the checkout, the setup and the check, it sets only runs-on, timeout-minutes, steps and permissions, which only read, its workflow sets only name, on, permissions and jobs, and it reads no secret", () => {
  expect(gateJobProblems(workflowAt(weeklyWorkflow), "pins", newestReleasesCheck)).toEqual([]);
});

test("a UI SDK pin follows the release the latest dist-tag names, once it is old enough to install: a release ahead of latest is not newer, a pin ahead of latest fails by name, and a document with no latest tag fails by name", () => {
  const betas: Listing[] = [
    ["0.1.0-beta.5", 3],
    ["0.1.0-beta.6", 2],
    ["0.1.0-beta.7", 1.5],
  ];
  const tagged = (latest: string, releases: Listing[] = betas): RegistryDocument => ({
    ...registryDocument(releases),
    "dist-tags": { latest, beta: "0.1.0-beta.7" },
  });
  const sdk = (pinned: string, document: RegistryDocument) =>
    check({
      pins: pinsOf(manifest, { "@ui-sdk/core": pinned }),
      documents: { ...documents, "@ui-sdk/core": document },
    });

  expect(sdk("0.1.0-beta.5", tagged("0.1.0-beta.6")).comparisons[0]).toMatchObject({
    status: "behind",
    newest: "0.1.0-beta.6",
    eligible: "0.1.0-beta.6",
    channel: "the release its registry document's latest dist-tag names",
  });
  expect(sdk("0.1.0-beta.6", tagged("0.1.0-beta.6")).comparisons[0]).toMatchObject({
    status: "current",
    newest: "0.1.0-beta.6",
  });
  const ahead = sdk("0.1.0-beta.7", tagged("0.1.0-beta.6"));
  expect(ahead.comparisons[0]).toMatchObject({ status: "ahead", newest: "0.1.0-beta.6" });
  expect(ahead.problems[0]).toBe(
    "@ui-sdk/core: 0.1.0-beta.7 is ahead of 0.1.0-beta.6, the newest release on its channel (the release its registry document's latest dist-tag names). Pin 0.1.0-beta.6.",
  );
  expect(
    sdk(
      "0.1.0-beta.5",
      tagged("0.1.0-beta.6", [
        ["0.1.0-beta.5", 3],
        ["0.1.0-beta.6", 0.25],
      ]),
    ).comparisons[0],
  ).toMatchObject({ status: "not yet eligible", eligibleAt: "2026-11-15T06:00:00.000Z" });
  expect(sdk("0.1.0-beta.5", registryDocument(betas)).problems[0]).toBe(
    "@ui-sdk/core: its registry document has no latest dist-tag.",
  );
});

test("on any channel, a pin ahead of the newest release published on it fails by name, whatever that release's age, and a pin whose package has no registry document says so", () => {
  expect(checkOf("a-package", "2.0.0", [["1.9.0", 10]]).problems[0]).toBe(
    "a-package: 2.0.0 is ahead of 1.9.0, the newest release on its channel (its newest stable release). Pin 1.9.0.",
  );
  expect(checkOf("a-package", "1.9.1", [["1.9.0", 0.25]]).comparison).toMatchObject({
    status: "ahead",
  });
  expect(
    check({ pins: pinsOf(manifest, { "a-package": "1.0.0" }), documents: {} }).problems[0],
  ).toBe("a-package: the registry answer holds no document for a-package.");
});

test("exactlyRequiredBy reads the dependencies and optionalDependencies a manifest names at one exact version, and nothing it names by a range", () => {
  expect(
    exactlyRequiredBy({
      dependencies: { exact: "1.2.3", ranged: "^1.2.3", tagged: "latest" },
      optionalDependencies: { build: "2.0.0", "loose-build": "~2.0.0" },
      peerDependencies: { peer: "3.0.0" },
    }),
  ).toEqual([
    { name: "exact", version: "1.2.3" },
    { name: "build", version: "2.0.0" },
  ]);
  expect(exactlyRequiredBy(undefined)).toEqual([]);
});

test("a pin ahead of its channel passes while the held-back list holds it with a reason and a liftWhen, and fails by name without one", () => {
  const hold = {
    name: "a-package",
    reason: "A release candidate tried ahead of the stable release.",
    liftWhen: "the stable release is out.",
    holds: "ahead",
  };
  const ahead = () =>
    check({
      pins: pinsOf(manifest, { "a-package": "2.1.0-rc.1" }),
      documents: { ...documents, "a-package": registryDocument([["2.0.1", 10]]) },
      heldBack: [hold],
    });

  expect(ahead().comparisons[0]).toMatchObject({ status: "held ahead", held: hold });
  expect(ahead().problems.filter((problem) => problem.startsWith("a-package"))).toEqual([]);
  expect(checkOf("a-package", "2.1.0-rc.1", [["2.0.1", 10]]).problems[0]).toMatch(
    /^a-package: 2\.1\.0-rc\.1 is ahead of 2\.0\.1, the newest release on its channel \(.+\)\. Pin 2\.0\.1\.$/,
  );
});

test("a held-back entry says which way it holds: one written for a pin ahead fails by name once the pin falls behind, one with no direction holds a pin behind and not one ahead, and an unknown direction fails", () => {
  const aheadHold = {
    name: "a-package",
    reason: "Tried ahead.",
    liftWhen: "2.1.0 is out.",
    holds: "ahead",
  };
  const behindHold = { name: "a-package", reason: "Waiting.", liftWhen: "it is fixed." };
  const run = (pinned: string, held: HeldBack) =>
    check({
      pins: pinsOf(manifest, { "a-package": pinned }),
      documents: {
        ...documents,
        "a-package": registryDocument([
          ["2.0.1", 30],
          ["2.1.0", 10],
        ]),
      },
      heldBack: [held],
    });
  const aboutThePackage = (pinned: string, held: HeldBack) =>
    run(pinned, held).problems.filter((problem) => problem.startsWith("a-package"));

  expect(aboutThePackage("2.1.0-rc.1", aheadHold)).toEqual([
    expect.stringMatching(/^a-package: 2\.1\.0-rc\.1 is behind 2\.1\.0/),
    "a-package: the held-back list holds it ahead of its channel, but it is behind; remove the entry, or rewrite it to hold the pin behind with a reason and a liftWhen for that.",
  ]);
  expect(run("2.1.0-rc.1", behindHold).comparisons[0]).toMatchObject({ status: "held back" });
  expect(aboutThePackage("2.1.0-rc.1", behindHold)).toEqual([]);
  expect(aboutThePackage("2.2.0", behindHold)).toEqual([
    expect.stringMatching(/^a-package: 2\.2\.0 is ahead of 2\.1\.0/),
    "a-package: the held-back list holds it behind its channel, but it is ahead; remove the entry, or rewrite it to hold the pin ahead with a reason and a liftWhen for that.",
  ]);
  expect(holdsWithoutReason([{ ...behindHold, holds: "sideways" }])).toEqual([
    `a-package: give the entry in ${heldBackFile} a reason, a liftWhen and, for a pin ahead of its channel, holds: "ahead".`,
  ]);
});

test("a second held-back entry for one pin fails by name, whichever way either holds and whichever comes first", () => {
  const aheadHold = {
    name: "a-package",
    reason: "Tried ahead.",
    liftWhen: "2.1.0 is out.",
    holds: "ahead",
  };
  const behindHold = { name: "a-package", reason: "Waiting.", liftWhen: "it is fixed." };
  const aboutThePackage = (pinned: string, heldBack: HeldBack[]) =>
    check({
      pins: pinsOf(manifest, { "a-package": pinned }),
      documents: { ...documents, "a-package": registryDocument([["2.1.0", 10]]) },
      heldBack,
    }).problems.filter((problem) => problem.startsWith("a-package"));
  const twice = "a-package: the held-back list names it more than once; keep one entry.";

  expect(aboutThePackage("2.2.0", [aheadHold, behindHold])).toEqual([twice]);
  expect(aboutThePackage("2.0.0", [behindHold, aheadHold])).toEqual([twice]);
  expect(aboutThePackage("2.2.0", [aheadHold, aheadHold])).toEqual([twice]);
  expect(aboutThePackage("2.2.0", [behindHold, aheadHold])).toEqual([
    expect.stringMatching(/^a-package: 2\.2\.0 is ahead of 2\.1\.0/),
    "a-package: the held-back list holds it behind its channel, but it is ahead; remove the entry, or rewrite it to hold the pin ahead with a reason and a liftWhen for that.",
    twice,
  ]);
});

test("a cron that GitHub cannot run, or that does not fire every week, fails naming the entry and each field at fault", () => {
  expect(cronProblems("29 5 * * 1")).toEqual([]);
  expect(cronProblems("*/15 0-6,12 * * mon-fri")).toEqual([]);
  expect(cronProblems("29 24 * * 9")).toEqual([
    'cron "29 24 * * 9": the hour field "24" is not within 0-23, with no range reversed.',
    'cron "29 24 * * 9": the day of week field "9" is not within 0-6 or SUN-SAT, with no range reversed.',
  ]);
  expect(cronProblems("29 5 * * 5-1")).toEqual([
    'cron "29 5 * * 5-1": the day of week field "5-1" is not within 0-6 or SUN-SAT, with no range reversed.',
  ]);
  expect(cronProblems("29 5 31 2 *")).toEqual([
    'cron "29 5 31 2 *": the day of month field "31" is not *.',
    'cron "29 5 31 2 *": the month field "2" is not *.',
  ]);
  expect(cronProblems("29 5 * *")).toEqual(['cron "29 5 * *": give it five fields.']);
});
