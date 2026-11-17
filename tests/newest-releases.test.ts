import { expect, test } from "vite-plus/test";
import {
  compareWithNewest,
  type HeldBack,
  heldBackFile,
  holdsOfNothing,
  holdsWithoutReason,
  newestSolidRelease,
  type NodeRelease,
  nodePinName,
  packageManagerPinName,
  type Pin,
  pinsOf,
  prereleasePinsNamedBy,
  type RegistryDocument,
  type ReleasePolicy,
} from "#/scripts/newest-releases.ts";
import { pnpmSettings } from "#/scripts/pnpm-settings.ts";
import { heldBackEntries, releasePolicy } from "#/scripts/release-sources.ts";
import { rootManifest } from "#/scripts/repository.ts";

const now = Date.parse("2026-11-14T12:00:00Z");
const day = 24 * 60 * 60_000;
const policy: ReleasePolicy = { minimumReleaseAgeMinutes: 24 * 60, excluded: [] };
const manifest = { packageManager: "pnpm@12.18.0", engines: { node: "^26.13.1" } };

type Release = [version: string, daysAgo: number, peers?: Record<string, string>];

function registryDocument(releases: Release[], unpublished: Release[] = []): RegistryDocument {
  const at = ([version, daysAgo]: Release) => [
    version,
    new Date(now - daysAgo * day).toISOString(),
  ];
  return {
    versions: Object.fromEntries(
      releases.map(([version, , peers]) => [version, { peerDependencies: peers }]),
    ),
    time: {
      created: "2020-01-01T00:00:00Z",
      ...Object.fromEntries([...releases, ...unpublished].map(at)),
    },
  };
}

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
    ["2.0.0-rc.21", 20],
    ["2.0.0-rc.22", 3],
  ]),
  "@solidjs/vite-plugin": registryDocument([
    ["3.0.0-next.35", 200],
    ["3.0.0-next.57", 20],
    ["3.0.0-next.58", 4],
    ["4.0.0-next.0", 4],
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
  "solid-js": "2.0.0-rc.21",
  "@solidjs/vite-plugin": "3.0.0-next.57",
  "@types/node": "^26.6.6",
  vite: "npm:@voidzero-dev/vite-plus-core@1.6.0",
});

function check(
  options: {
    pins?: Pin[];
    documents?: Record<string, RegistryDocument>;
    nodeReleases?: NodeRelease[];
    excluded?: ReleasePolicy["excluded"];
    heldBack?: HeldBack[];
    untilStable?: string[];
  } = {},
) {
  return compareWithNewest({
    pins: options.pins ?? pins,
    documents: options.documents ?? documents,
    nodeReleases: options.nodeReleases ?? nodeReleases,
    policy: { ...policy, excluded: options.excluded ?? [] },
    now,
    heldBack: options.heldBack ?? [],
    untilStable: options.untilStable ?? [],
  });
}

function checkOf(name: string, pinned: string, releases: Release[], untilStable: string[] = []) {
  const report = check({
    pins: pinsOf(manifest, { [name]: pinned }),
    documents: { ...documents, [name]: registryDocument(releases) },
    untilStable,
  });
  return { comparison: report.comparisons[0], problems: report.problems };
}

function statuses(options: Parameters<typeof check>[0] = {}): Record<string, string> {
  return Object.fromEntries(
    check(options).comparisons.map(({ pin, status }) => [pin.name, status]),
  );
}

function solidLine(webPeer: (version: string) => string, releases: Release[]) {
  return {
    "solid-js": registryDocument(releases),
    "@solidjs/web": registryDocument(
      releases.map(([version, daysAgo]) => [version, daysAgo, { "solid-js": webPeer(version) }]),
    ),
    "@solidjs/compiler": registryDocument(releases),
    "@solidjs/signals": registryDocument(releases),
  };
}

test("each pin is compared with the newest published release on its own channel, not with a dist-tag", () => {
  const newest = Object.fromEntries(
    check().comparisons.map((comparison) => [
      comparison.pin.name,
      comparison.status === "unknown" ? undefined : comparison.newest,
    ]),
  );

  expect(newest).toEqual({
    semver: "7.8.7",
    playwright: "1.65.1",
    "solid-js": "2.0.0-rc.22",
    "@solidjs/vite-plugin": "3.0.0-next.58",
    "@types/node": "26.6.7",
    vite: "1.6.0",
    [packageManagerPinName]: "12.18.0",
    [nodePinName]: "26.13.2",
  });
});

test("a release younger than the minimum release age is not yet eligible, not behind, unless an exclusion names it", () => {
  const semver = check().comparisons.find(({ pin }) => pin.name === "semver");

  expect(semver).toMatchObject({
    status: "not yet eligible",
    eligibleAt: "2026-11-15T06:00:00.000Z",
  });
  expect(check().problems.join("\n")).not.toContain("semver");
  expect(statuses({ excluded: [{ name: "semver", version: "7.8.7" }] }).semver).toBe("behind");
  expect(statuses({ excluded: [{ name: "semver", version: "7.8.5" }] }).semver).toBe(
    "not yet eligible",
  );
  expect(statuses({ excluded: [{ name: "semver" }] }).semver).toBe("behind");
});

test("releasePolicy reads each minimumReleaseAgeExclude entry as a package name or <name>@<exact version>, refuses any other, and accepts this repository's own", () => {
  const settings = { ...pnpmSettings(), minimumReleaseAge: 1440 };
  const withExclusions = (minimumReleaseAgeExclude: string[]) =>
    releasePolicy({ ...settings, minimumReleaseAgeExclude });

  expect(withExclusions(["semver", "@types/node@26.6.7"]).excluded).toEqual([
    { name: "semver" },
    { name: "@types/node", version: "26.6.7" },
  ]);
  expect(() => withExclusions(["semver", "semver@^7"])).toThrow(/"semver@\^7" is not a package/);
  expect(() => withExclusions(["@types/*"])).toThrow(/is not a package name/);
  expect(() => withExclusions(["semver@7.8.7 || 7.8.8"])).toThrow(/is not a package name/);
  expect(() => releasePolicy({ ...settings, minimumReleaseAge: undefined })).toThrow(
    /set minimumReleaseAge/,
  );
  expect(() => releasePolicy(pnpmSettings())).not.toThrow();
});

test("each channel finds what is behind: stable, the Solid 2 line, the plugin's pinned major, the Node LTS major and Node's newest LTS", () => {
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

test("the Solid 2 line takes a stable 2.x once one is old enough to install, and never a Solid 3 release", () => {
  const afterStable: Release[] = [
    ["2.0.0-rc.22", 30],
    ["2.0.0", 20],
    ["2.0.1", 10],
    ["3.0.0-alpha.1", 5],
  ];
  const beforeStable: Release[] = [
    ["2.0.0-rc.21", 20],
    ["2.0.0-rc.22", 10],
    ["3.0.0-alpha.1", 5],
  ];

  expect(checkOf("solid-js", "2.0.0-rc.22", afterStable).comparison).toMatchObject({
    status: "behind",
    newest: "2.0.1",
    eligible: "2.0.1",
  });
  expect(checkOf("solid-js", "2.0.0-rc.22", beforeStable).comparison).toMatchObject({
    status: "current",
    newest: "2.0.0-rc.22",
  });
});

test("on the first day of a stable Solid 2, a newer release candidate that is old enough is still what a pin is behind", () => {
  const firstDay: Release[] = [
    ["2.0.0-rc.22", 60],
    ["2.0.0-rc.23", 5],
    ["2.0.0", 0.25],
  ];

  expect(checkOf("solid-js", "2.0.0-rc.22", firstDay).comparison).toMatchObject({
    status: "behind",
    eligible: "2.0.0-rc.23",
    newest: "2.0.0",
  });
  expect(checkOf("solid-js", "2.0.0-rc.23", firstDay).comparison).toMatchObject({
    status: "not yet eligible",
    eligibleAt: "2026-11-15T06:00:00.000Z",
  });
  expect(
    newestSolidRelease(
      solidLine(() => "*", firstDay),
      policy,
      now,
    ),
  ).toBe("2.0.0-rc.23");
});

test("while @solidjs/web has no stable Solid 2 yet, the canary takes the newest release every Solid package has", () => {
  const lagging = {
    "solid-js": registryDocument([
      ["2.0.0-rc.23", 9],
      ["2.0.0", 5],
    ]),
    "@solidjs/web": registryDocument([["2.0.0-rc.23", 9]]),
    "@solidjs/compiler": registryDocument([
      ["2.0.0-rc.23", 9],
      ["2.0.0", 5],
    ]),
    "@solidjs/signals": registryDocument([
      ["2.0.0-rc.23", 9],
      ["2.0.0", 5],
    ]),
  };

  expect(newestSolidRelease(lagging, policy, now)).toBe("2.0.0-rc.23");
});

test("a prerelease pin with no channel of its own is behind a newer prerelease of the version it pins that carries the pin's own identifier, and behind that version once it is stable", () => {
  const betas: Release[] = [
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
  const neverStable: Release[] = [
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

test("the prerelease pins that a manifest names are the catalog entries it names whose catalog version is a prerelease", () => {
  expect(
    prereleasePinsNamedBy(
      {
        dependencies: { "a-library": "workspace:*", "a-stable-tool": "catalog:" },
        devDependencies: { "a-framework": "catalog:", "an-addon": "catalog:" },
      },
      {
        "a-framework": "11.0.0-next-20261020160717",
        "an-addon": "11.0.0-beta.3",
        "a-stable-tool": "1.0.0",
        "an-unnamed-beta": "2.0.0-beta.1",
      },
    ),
  ).toEqual(["a-framework", "an-addon"]);
});

test("a pin on the until-stable channel is behind the newest release of the major it pins, nightly, beta or release candidate, and follows stable releases once that major has one old enough to install", () => {
  const nightlies: Release[] = [
    ["10.7.4", 30],
    ["11.0.0-next-20261020160717", 28],
    ["11.0.0-next-20261105190313", 12],
    ["11.0.0-next-20261116090000", 0.5],
    ["12.0.0-next-20261101000000", 10],
  ];
  const beforeStable: Release[] = [
    ["10.6.7", 7],
    ["11.0.0-beta.3", 4],
    ["11.0.0-rc.0", 2],
    ["11.0.0-rc.1", 0.5],
  ];
  const afterStable: Release[] = [
    ...beforeStable,
    ["11.0.0", 2],
    ["11.0.1", 0.5],
    ["11.1.0-beta.0", 1.5],
  ];
  const untilStable = ["a-package"];

  expect(
    checkOf("a-package", "11.0.0-next-20261020160717", nightlies, untilStable).comparison,
  ).toMatchObject({
    status: "behind",
    eligible: "11.0.0-next-20261105190313",
    newest: "11.0.0-next-20261116090000",
  });
  expect(
    checkOf("a-package", "11.0.0-next-20261105190313", nightlies, untilStable).comparison,
  ).toMatchObject({ status: "not yet eligible" });
  expect(checkOf("a-package", "11.0.0-beta.3", beforeStable, untilStable).comparison).toMatchObject(
    { status: "behind", eligible: "11.0.0-rc.0" },
  );
  expect(checkOf("a-package", "11.0.0-beta.3", beforeStable).comparison).toMatchObject({
    status: "current",
  });
  expect(checkOf("a-package", "11.0.0-rc.0", afterStable, untilStable).comparison).toMatchObject({
    status: "behind",
    eligible: "11.0.0",
    newest: "11.0.1",
  });
  expect(checkOf("a-package", "11.0.0", afterStable, untilStable).comparison).toMatchObject({
    status: "not yet eligible",
    newest: "11.0.1",
  });
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
  expect(() =>
    newestSolidRelease({ "solid-js": noTime, "@solidjs/web": noTime }, policy, now),
  ).toThrow("solid-js: the registry gives no publish time for solid-js@7.8.7");
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

test("the Solid 2 canary takes one release for every Solid package, old enough for each and accepted by their peer ranges", () => {
  const lockstep = solidLine(
    (version) => `^${version}`,
    [
      ["2.0.0-rc.21", 20],
      ["2.0.0-rc.22", 2],
    ],
  );
  lockstep["solid-js"] = registryDocument([
    ["2.0.0-rc.21", 20],
    ["2.0.0-rc.22", 0.25],
  ]);
  const peerTooNew = solidLine(
    (version) => (version === "2.0.0-rc.22" ? "^2.0.0-rc.23" : "*"),
    [
      ["2.0.0-rc.21", 20],
      ["2.0.0-rc.22", 2],
    ],
  );

  const webTooYoung = {
    "solid-js": lockstep["@solidjs/web"],
    "@solidjs/web": lockstep["solid-js"],
    "@solidjs/compiler": lockstep["@solidjs/compiler"],
    "@solidjs/signals": lockstep["@solidjs/signals"],
  };

  expect(newestSolidRelease(lockstep, policy, now)).toBe("2.0.0-rc.21");
  expect(newestSolidRelease(webTooYoung, policy, now)).toBe("2.0.0-rc.21");
  expect(newestSolidRelease(peerTooNew, policy, now)).toBe("2.0.0-rc.21");
  expect(
    newestSolidRelease(
      lockstep,
      { ...policy, excluded: [{ name: "solid-js", version: "2.0.0-rc.22" }] },
      now,
    ),
  ).toBe("2.0.0-rc.22");
});

test("the Solid 2 canary refuses a peer range it cannot read instead of passing over that release, and says when no release will do", () => {
  const unreadable = solidLine(
    (version) => (version === "2.0.0-rc.22" ? "workspace:^" : "*"),
    [
      ["2.0.0-rc.21", 20],
      ["2.0.0-rc.22", 2],
    ],
  );

  expect(() => newestSolidRelease(unreadable, policy, now)).toThrow(
    '@solidjs/web@2.0.0-rc.22: its peer range "workspace:^" for solid-js is not a semver range',
  );
  expect(() => newestSolidRelease({}, policy, now)).toThrow(
    "No Solid 2 release is published for solid-js, @solidjs/web, @solidjs/compiler and @solidjs/signals alike, old enough to install and accepted by their peer ranges.",
  );
});

test("the Solid 2 canary stays on Solid 2 when next moves to Solid 3, and takes 2.x stable once it is old enough to install", () => {
  const releases: Release[] = [
    ["2.0.0-rc.22", 30],
    ["2.0.0", 20],
    ["2.0.1", 10],
    ["3.0.0-alpha.1", 5],
  ];

  expect(
    newestSolidRelease(
      solidLine(() => "*", releases),
      policy,
      now,
    ),
  ).toBe("2.0.1");
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
  ).toEqual(["vite: the held-back list holds it, but it is not behind; remove the entry."]);
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
