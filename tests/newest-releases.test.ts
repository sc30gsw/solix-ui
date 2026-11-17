import { expect, test } from "vite-plus/test";
import {
  compareWithNewest,
  exactCatalogReleases,
  exactlyRequiredBy,
  type HeldBack,
  heldBackFile,
  holdsOfNothing,
  holdsWithoutReason,
  type NodeRelease,
  nodePinName,
  outgrownExemptions,
  packageManagerPinName,
  type Pin,
  pinsOf,
  prereleasePinsOnlyNamedBy,
  type RegistryDocument,
  registryNamesToFetch,
  type ReleasePolicy,
  unjustifiedExemptions,
} from "#/scripts/newest-releases.ts";
import { pnpmSettings } from "#/scripts/pnpm-settings.ts";
import {
  heldBackEntries,
  releasePolicy,
  storybookAppManifest,
  untilStableMembers,
} from "#/scripts/release-sources.ts";
import { manifestAt, manifestPaths, rootManifest } from "#/scripts/repository.ts";
import { type Listing, now, policy, registryDocument } from "#/tests/support/registry-fixtures.ts";
import {
  expectEveryJobToRunOnASchedule,
  expectScheduledJobToRun,
} from "#/tests/support/weekly-workflow.ts";

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

function check(
  options: {
    pins?: Pin[];
    documents?: Record<string, RegistryDocument>;
    nodeReleases?: NodeRelease[];
    exempted?: ReleasePolicy["exempted"];
    heldBack?: HeldBack[];
    untilStablePackages?: string[];
  } = {},
) {
  return compareWithNewest({
    pins: options.pins ?? pins,
    documents: options.documents ?? documents,
    nodeReleases: options.nodeReleases ?? nodeReleases,
    policy: { ...policy, exempted: options.exempted ?? [] },
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

test("a release younger than the minimum release age is not yet eligible, not behind, unless an exemption names it", () => {
  const semver = check().comparisons.find(({ pin }) => pin.name === "semver");

  expect(semver).toMatchObject({
    status: "not yet eligible",
    eligibleAt: "2026-11-15T06:00:00.000Z",
  });
  expect(check().problems.join("\n")).not.toContain("semver");
  expect(statuses({ exempted: [{ name: "semver", version: "7.8.7" }] }).semver).toBe("behind");
  expect(statuses({ exempted: [{ name: "semver", version: "7.8.5" }] }).semver).toBe(
    "not yet eligible",
  );
});

test("an exemption in minimumReleaseAgeExclude fails the check by name once its release is old enough to install without it, and so does one whose release the registry does not list or whose package has no registry document", () => {
  const exemptions = [
    { name: "semver", version: "7.8.7" },
    { name: "semver", version: "7.8.6" },
    { name: "a-platform-build", version: "2.0.0" },
    { name: "a-platform-build", version: "2.0.1" },
    { name: "semver", version: "7.9.0" },
    { name: "a-missing-package", version: "1.0.0" },
  ];
  const report = check({
    documents: {
      ...documents,
      "a-platform-build": registryDocument([
        ["2.0.0", 1],
        ["2.0.1", 0.5],
      ]),
    },
    exempted: exemptions,
  });

  expect(report.problems.filter((problem) => problem.includes("minimumReleaseAgeExclude"))).toEqual(
    [
      "semver@7.8.6: it is older than minimumReleaseAge, so pnpm installs it without an exemption. Remove it from minimumReleaseAgeExclude.",
      "a-platform-build@2.0.0: it is older than minimumReleaseAge, so pnpm installs it without an exemption. Remove it from minimumReleaseAgeExclude.",
      "semver@7.9.0: the registry lists no such release. So nothing tells whether minimumReleaseAgeExclude still needs it.",
      "a-missing-package@1.0.0: the registry answer holds no document for a-missing-package. So nothing tells whether minimumReleaseAgeExclude still needs it.",
    ],
  );
  expect(
    check({ exempted: [{ name: "semver", version: "7.8.7" }] }).problems.join("\n"),
  ).not.toContain("minimumReleaseAgeExclude");
});

test("the weekly check fetches the registry document of every registry pin and of every exempted package, each once", () => {
  const exemptions = [
    { name: "a-platform-build", version: "2.0.0" },
    { name: "semver", version: "7.8.7" },
  ];

  expect(registryNamesToFetch(pins, { ...policy, exempted: exemptions })).toEqual([
    "semver",
    "playwright",
    "solid-js",
    "@solidjs/vite-plugin",
    "@types/node",
    "@voidzero-dev/vite-plus-core",
    "pnpm",
    "a-platform-build",
  ]);
});

test("releasePolicy reads each minimumReleaseAgeExclude entry as <name>@<exact version>, refuses any other, a bare package name included, and accepts this repository's own", () => {
  const settings = { ...pnpmSettings(), minimumReleaseAge: 1440 };
  const withExemptions = (minimumReleaseAgeExclude: string[]) =>
    releasePolicy({ ...settings, minimumReleaseAgeExclude });

  expect(withExemptions(["semver@7.8.7", "@types/node@26.6.7"]).exempted).toEqual([
    { name: "semver", version: "7.8.7" },
    { name: "@types/node", version: "26.6.7" },
  ]);
  expect(() => withExemptions(["semver"])).toThrow(/"semver" is not <name>@<exact version>/);
  expect(() => withExemptions(["semver@^7"])).toThrow(/"semver@\^7" is not <name>@<exact/);
  expect(() => withExemptions(["@types/*"])).toThrow(/is not <name>@<exact version>/);
  expect(() => withExemptions(["semver@7.8.7 || 7.8.8"])).toThrow(/is not <name>@<exact/);
  expect(() => withExemptions(["semver@v7.8.7"])).toThrow(/is not <name>@<exact/);
  expect(() => releasePolicy({ ...settings, minimumReleaseAge: undefined })).toThrow(
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

test("a held-back entry that holds nothing back, or has no reason or no liftWhen, fails the check", () => {
  const idle = { name: "vite", reason: "Waiting.", liftWhen: "it is out." };
  const unexplained = { name: "playwright", reason: "", liftWhen: "" };

  expect(
    holdsOfNothing([idle, unexplained], check({ heldBack: [unexplained] }).comparisons),
  ).toEqual([
    "vite: the held-back list holds it, but it is neither behind nor ahead of its channel; remove the entry.",
  ]);
  expect(holdsWithoutReason([idle, unexplained])).toEqual([
    `playwright: give the entry in ${heldBackFile} a reason and a liftWhen.`,
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

test("every job of the weekly workflow runs each week: the schedule fires weekly, and no job sets if, needs or continue-on-error or lacks a timeout", () => {
  expectEveryJobToRunOnASchedule();
});

test("the pins job has exactly one step that runs the pin check, which retires exemptions, with no if and no continue-on-error", () => {
  expectScheduledJobToRun("pins", "node scripts/check-newest-releases.ts");
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

test("the releases the catalog pins exactly are its entries pinned to one version, aliased ones under their registry name, without a range and without packageManager", () => {
  expect(
    exactCatalogReleases(
      pinsOf(manifest, {
        semver: "7.8.6",
        playwright: "^1.63.0",
        vite: "npm:@voidzero-dev/vite-plus-core@1.6.0",
      }),
    ),
  ).toEqual([
    { name: "semver", version: "7.8.6" },
    { name: "@voidzero-dev/vite-plus-core", version: "1.6.0" },
  ]);
});

test("an exemption is unjustified unless the lockfile locks its release and the catalog pins it exactly or a pinned release requires it exactly", () => {
  const sources = {
    locked: ["solid-js@2.0.0", "a-build@2.0.0", "a-stray@1.0.0"],
    pinned: [{ name: "solid-js", version: "2.0.0" }],
    required: [{ name: "a-build", version: "2.0.0" }],
  };

  expect(
    unjustifiedExemptions(
      [
        { name: "solid-js", version: "2.0.0" },
        { name: "a-build", version: "2.0.0" },
        { name: "a-stray", version: "1.0.0" },
        { name: "a-build", version: "1.9.0" },
      ],
      sources,
    ),
  ).toEqual([
    "minimumReleaseAgeExclude names a-stray@1.0.0, which the catalog does not pin and no release it pins lists at that exact version; remove the entry.",
    "minimumReleaseAgeExclude names a-build@1.9.0, which pnpm-lock.yaml does not lock, so nothing installs it; remove the entry.",
    "minimumReleaseAgeExclude names a-build@1.9.0, which the catalog does not pin and no release it pins lists at that exact version; remove the entry.",
  ]);
});

test("once the catalog moves a Solid package to a newer release, an exemption still naming the older one is named by the weekly check when the older release was published first, and by the exemption rule whatever the order", () => {
  const exemption = { name: "solid-js", version: "2.0.0" };
  const afterTheMove = {
    locked: ["solid-js@2.0.1"],
    pinned: [{ name: "solid-js", version: "2.0.1" }],
    required: [],
  };
  const outgrown = (listings: Listing[]) =>
    outgrownExemptions(
      { "solid-js": registryDocument(listings) },
      { ...policy, exempted: [exemption] },
      now,
    );

  expect(
    outgrown([
      ["2.0.0", 1.5],
      ["2.0.1", 1],
    ]),
  ).toEqual([
    "solid-js@2.0.0: it is older than minimumReleaseAge, so pnpm installs it without an exemption. Remove it from minimumReleaseAgeExclude.",
  ]);
  expect(
    outgrown([
      ["2.0.1", 1],
      ["2.0.0", 0.5],
    ]),
  ).toEqual([]);
  expect(unjustifiedExemptions([exemption], afterTheMove)).toEqual([
    "minimumReleaseAgeExclude names solid-js@2.0.0, which pnpm-lock.yaml does not lock, so nothing installs it; remove the entry.",
    "minimumReleaseAgeExclude names solid-js@2.0.0, which the catalog does not pin and no release it pins lists at that exact version; remove the entry.",
  ]);
});

test("an exemption is judged by its own release's publish time: one with none is unknown by name, and another version with none does not make it unknown", () => {
  const timeless = registryDocument([
    ["7.8.5", 30],
    ["7.8.6", 10],
    ["7.8.7", 5],
  ]);
  const { "7.8.7": _withoutTime, ...otherTimes } = timeless.time ?? {};
  const { "7.8.5": _alsoWithoutTime, ...laterTimes } = timeless.time ?? {};
  const outgrown = (time: Record<string, string>, version: string) =>
    outgrownExemptions(
      { semver: { ...timeless, time } },
      { ...policy, exempted: [{ name: "semver", version }] },
      now,
    );

  expect(outgrown(otherTimes, "7.8.7")).toEqual([
    "semver@7.8.7: the registry gives no publish time for semver@7.8.7, so its age cannot be told. So nothing tells whether minimumReleaseAgeExclude still needs it.",
  ]);
  expect(outgrown(laterTimes, "7.8.6")).toEqual([
    "semver@7.8.6: it is older than minimumReleaseAge, so pnpm installs it without an exemption. Remove it from minimumReleaseAgeExclude.",
  ]);
});

test("a pin ahead of its channel passes while the held-back list holds it with a reason and a liftWhen, and fails by name without one", () => {
  const hold = {
    name: "a-package",
    reason: "A release candidate tried ahead of the stable release.",
    liftWhen: "the stable release is out.",
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
