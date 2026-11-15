import { expect, test } from "vite-plus/test";
import {
  compareWithNewest,
  type HeldBack,
  heldBackFile,
  heldBackProblems,
  isExcluded,
  newestSolidRelease,
  type NodeRelease,
  nodePinName,
  packageManagerPinName,
  pinsOf,
  type RegistryDocument,
  type ReleasePolicy,
  solidReleases,
  withCatalogVersions,
} from "../scripts/newest-releases";
import { pnpmSettings, settingsFrom, workspaceFile } from "../scripts/pnpm-settings";
import { heldBackEntries, rootManifest } from "../scripts/release-sources";

const now = Date.parse("2026-11-14T12:00:00Z");
const day = 24 * 60 * 60_000;
const policy: ReleasePolicy = { minimumReleaseAgeMinutes: 24 * 60, excluded: [], now };

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
const pins = pinsOf(
  { packageManager: "pnpm@12.18.0", engines: { node: "^26.13.1" } },
  {
    semver: "7.8.6",
    playwright: "^1.63.0",
    "solid-js": "2.0.0-rc.21",
    "@solidjs/vite-plugin": "3.0.0-next.57",
    "@types/node": "^26.6.6",
    vite: "npm:@voidzero-dev/vite-plus-core@1.6.0",
  },
);

function check(options: { excluded?: string[]; heldBack?: HeldBack[] } = {}) {
  return compareWithNewest({
    pins,
    documents,
    nodeReleases,
    policy: { ...policy, excluded: options.excluded ?? [] },
    heldBack: options.heldBack ?? [],
  });
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
  };
}

test("each pin is compared with the newest published release on its own channel, not with a dist-tag", () => {
  const newest = Object.fromEntries(
    check().comparisons.map((comparison) => [
      comparison.pin.name,
      comparison.status === "no release" ? undefined : comparison.newest,
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
  expect(statuses({ excluded: ["semver@7.8.7"] }).semver).toBe("behind");
  expect(statuses({ excluded: ["semver"] }).semver).toBe("behind");
});

test("the exclusion matcher rejects an entry that is not a package name or <name>@<exact version>", () => {
  expect(() => isExcluded("semver", "7.8.7", ["semver@^7"])).toThrow(/is not a package name/);
  expect(() => isExcluded("semver", "7.8.7", ["@types/*"])).toThrow(/is not a package name/);
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

test("the Solid 2 line takes a stable 2.x once one exists, and never a Solid 3 release", () => {
  const afterStable = registryDocument([
    ["2.0.0-rc.22", 30],
    ["2.0.0", 20],
    ["2.0.1", 10],
    ["3.0.0-alpha.1", 5],
  ]);
  const beforeStable = registryDocument([
    ["2.0.0-rc.21", 20],
    ["2.0.0-rc.22", 10],
    ["3.0.0-alpha.1", 5],
  ]);

  expect(solidReleases("solid-js", afterStable, policy).eligible[0]).toBe("2.0.1");
  expect(solidReleases("solid-js", beforeStable, policy).eligible[0]).toBe("2.0.0-rc.22");
});

test("a version the registry lists only in time, unpublished, is no release", () => {
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
  };

  expect(newestSolidRelease(lockstep, policy)).toBe("2.0.0-rc.21");
  expect(newestSolidRelease(webTooYoung, policy)).toBe("2.0.0-rc.21");
  expect(newestSolidRelease(peerTooNew, policy)).toBe("2.0.0-rc.21");
  expect(newestSolidRelease(lockstep, { ...policy, excluded: ["solid-js@2.0.0-rc.22"] })).toBe(
    "2.0.0-rc.22",
  );
});

test("the Solid 2 canary stays on Solid 2 when next moves to Solid 3, and takes 2.x stable when it ships", () => {
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
    ),
  ).toBe("2.0.1");
});

test("withCatalogVersions rewrites only the Solid entries of the catalog", () => {
  const workspace = [
    "catalog:",
    '  "@solidjs/web": 2.0.0-rc.21',
    "  solid-js: 2.0.0-rc.21",
    "  solid2-agent-kit: 0.25.0",
    "",
  ].join("\n");
  const catalog = {
    "@solidjs/web": "2.0.0-rc.21",
    "solid-js": "2.0.0-rc.21",
    "solid2-agent-kit": "0.25.0",
  };

  expect(
    withCatalogVersions(workspace, catalog, {
      "solid-js": "2.0.0-rc.22",
      "@solidjs/web": "2.0.0-rc.22",
    }),
  ).toBe(workspace.replaceAll("2.0.0-rc.21", "2.0.0-rc.22"));
});

test("a pin behind its channel fails the check, unless the held-back list holds it with a reason and a liftWhen", () => {
  const hold = {
    name: "playwright",
    reason: "The CI image has no browsers for 1.65 yet.",
    liftWhen: "the CI image ships them.",
  };

  expect(
    check().problems.some((problem) => problem.startsWith("playwright: 1.63.0 is behind")),
  ).toBe(true);
  expect(statuses({ heldBack: [hold] }).playwright).toBe("held back");
  expect(
    check({ heldBack: [hold] }).problems.some((problem) => problem.startsWith("playwright:")),
  ).toBe(false);
});

test("a held-back entry that holds nothing back, or has no reason or no liftWhen, fails the check", () => {
  const { comparisons } = check();

  expect(
    heldBackProblems([{ name: "vite", reason: "Waiting.", liftWhen: "it is out." }], comparisons),
  ).toEqual(["vite: the held-back list holds it, but it is not behind; remove the entry."]);
  expect(
    heldBackProblems([{ name: "playwright", reason: "", liftWhen: "" }], comparisons),
  ).toContain(`playwright: give the entry in ${heldBackFile} a reason and a liftWhen.`);
});

test("pinsOf refuses a manifest without packageManager or engines.node, and pnpm settings without a catalog", () => {
  expect(() => pinsOf({ engines: { node: "^26.13.1" } }, { semver: "7.8.6" })).toThrow(
    /packageManager/,
  );
  expect(() => pinsOf({ packageManager: "pnpm@12.18.0" }, { semver: "7.8.6" })).toThrow(
    /engines\.node/,
  );
  expect(() => settingsFrom({})).toThrow(/no catalog entries/);
  expect(() => settingsFrom({ catalog: {} })).toThrow(/no catalog entries/);
  expect(() =>
    settingsFrom({ catalog: { semver: "7.8.6" }, permissions: { a: { skills: true } } }),
  ).toThrow(/instead of skills: true/);
});

test(`${heldBackFile} names only pins of this repository, and holds each back with a reason and a liftWhen`, () => {
  const heldBack = heldBackEntries();
  const names = pinsOf(rootManifest(), pnpmSettings().catalog).map(({ name }) => name);

  expect(heldBack.filter(({ name }) => !names.includes(name))).toEqual([]);
  expect(
    heldBackProblems(heldBack, []).filter((problem) => !problem.includes("not behind")),
  ).toEqual([]);
});

test(`${workspaceFile} sets minimumReleaseAge and minimumReleaseAgeStrict: true`, () => {
  expect(pnpmSettings().minimumReleaseAge).toBeGreaterThan(0);
  expect(pnpmSettings().minimumReleaseAgeStrict).toBe(true);
});
