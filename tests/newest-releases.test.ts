import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import {
  type HeldBack,
  newestReleases,
  type NodeRelease,
  nodeName,
  packageManagerName,
  pinsOf,
} from "../scripts/newest-releases";
import { catalogVersions, repositoryRoot, rootManifest, workspaceFile } from "./support/workspace";

const now = Date.parse("2026-11-14T12:00:00Z");
const day = 24 * 60 * 60_000;
const minimumReleaseAge = 24 * 60;
const heldBackFile = "scripts/held-back-releases.json";

type Release = [version: string, daysAgo: number];

function published(releases: Release[]): Record<string, string> {
  return Object.fromEntries(
    releases.map(([version, daysAgo]) => [version, new Date(now - daysAgo * day).toISOString()]),
  );
}

function registryDocument(tags: Record<string, string>, releases: Release[]) {
  return { "dist-tags": tags, time: { created: "2020-01-01T00:00:00Z", ...published(releases) } };
}

const documents = {
  semver: registryDocument({ latest: "7.8.7" }, [
    ["7.8.5", 30],
    ["7.8.6", 10],
    ["7.8.7", 0.25],
  ]),
  playwright: registryDocument({ latest: "1.65.1", next: "1.66.0-alpha.1" }, [
    ["1.63.0", 60],
    ["1.65.1", 2],
    ["1.66.0-alpha.1", 1.5],
  ]),
  "solid-js": registryDocument({ latest: "1.9.19", next: "2.0.0-rc.22" }, [
    ["1.9.19", 90],
    ["2.0.0-rc.21", 20],
    ["2.0.0-rc.22", 3],
  ]),
  "@solidjs/vite-plugin": registryDocument({ latest: "3.0.0-next.57", next: "3.0.0-next.35" }, [
    ["3.0.0-next.35", 200],
    ["3.0.0-next.57", 20],
    ["3.0.0-next.58", 4],
  ]),
  "@types/node": registryDocument({ latest: "27.0.0" }, [
    ["26.6.6", 20],
    ["26.6.7", 5],
    ["27.0.0", 5],
  ]),
  "@voidzero-dev/vite-plus-core": registryDocument({ latest: "1.6.0" }, [["1.6.0", 30]]),
  pnpm: registryDocument({ latest: "12.18.0" }, [["12.18.0", 9]]),
};
const nodeReleases: NodeRelease[] = [
  { version: "v27.0.0-alpha.0.1.0", lts: false },
  { version: "v26.13.2", lts: "Lithium" },
  { version: "v26.13.1", lts: "Lithium" },
];
const pins = pinsOf({
  catalog: {
    semver: "7.8.6",
    playwright: "^1.63.0",
    "solid-js": "2.0.0-rc.21",
    "@solidjs/vite-plugin": "3.0.0-next.57",
    "@types/node": "^26.6.6",
    vite: "npm:@voidzero-dev/vite-plus-core@1.6.0",
  },
  packageManager: "pnpm@12.18.0",
  nodeRange: "^26.13.1",
});

function check(options: { excluded?: string[]; heldBack?: HeldBack[] } = {}) {
  return newestReleases({ pins, documents, nodeReleases, minimumReleaseAge, now, ...options });
}

function statuses(options: Parameters<typeof check>[0] = {}): Record<string, string> {
  return Object.fromEntries(check(options).rows.map(({ name, status }) => [name, status]));
}

test("each pin is compared with the newest release on its own channel", () => {
  const rows = Object.fromEntries(check().rows.map((row) => [row.name, row]));

  expect(rows.semver).toMatchObject({ pinned: "7.8.6", newest: "7.8.7", eligible: "7.8.6" });
  expect(rows.playwright).toMatchObject({ pinned: "1.63.0", newest: "1.65.1" });
  expect(rows["solid-js"]).toMatchObject({ newest: "2.0.0-rc.22", channel: "the next tag" });
  expect(rows["@solidjs/vite-plugin"]).toMatchObject({ newest: "3.0.0-next.58" });
  expect(rows["@types/node"]).toMatchObject({ newest: "26.6.7" });
  expect(rows.vite).toMatchObject({
    registryName: "@voidzero-dev/vite-plus-core",
    newest: "1.6.0",
  });
  expect(rows[packageManagerName]).toMatchObject({ registryName: "pnpm", pinned: "12.18.0" });
  expect(rows[nodeName]).toMatchObject({ pinned: "26.13.1", newest: "26.13.2" });
});

test("a release younger than the minimum release age is not yet eligible, not behind", () => {
  const row = check().rows.find(({ name }) => name === "semver");

  expect(row).toMatchObject({ status: "not yet eligible", eligibleAt: "2026-11-15T06:00:00.000Z" });
  expect(check().problems.join("\n")).not.toContain("semver");
});

test("a release the exclusions name is eligible at once", () => {
  expect(statuses({ excluded: ["semver@7.8.7"] }).semver).toBe("behind");
  expect(statuses({ excluded: ["semver"] }).semver).toBe("behind");
});

test("the latest tag, the next tag, the newest prerelease, the Node LTS major and Node's newest LTS each find what is behind", () => {
  expect(statuses()).toEqual({
    semver: "not yet eligible",
    playwright: "behind",
    "solid-js": "behind",
    "@solidjs/vite-plugin": "behind",
    "@types/node": "behind",
    vite: "current",
    [packageManagerName]: "current",
    [nodeName]: "behind",
  });
});

test("a pin behind its channel fails the check, unless the held-back list holds it with a reason and a lifting condition", () => {
  const hold = {
    name: "playwright",
    reason: "The CI image has no browsers for 1.65 yet.",
    lift: "the CI image ships them.",
  };
  const held = check({ heldBack: [hold] });

  expect(
    check().problems.some((problem) => problem.startsWith("playwright: 1.63.0 is behind")),
  ).toBe(true);
  expect(statuses({ heldBack: [hold] }).playwright).toBe("held back");
  expect(held.problems.some((problem) => problem.startsWith("playwright:"))).toBe(false);
});

test("a held-back entry that holds nothing back, or has no reason or no lifting condition, fails the check", () => {
  const stale = check({ heldBack: [{ name: "vite", reason: "Waiting.", lift: "it is out." }] });
  const bare = check({ heldBack: [{ name: "playwright", reason: "", lift: "" }] });

  expect(stale.problems).toContain(
    "vite: the held-back list holds it, but it is not behind; remove the entry, since its lifting condition has come.",
  );
  expect(bare.problems).toContain(
    "playwright: give the held-back entry a reason and a lifting condition.",
  );
});

test("the held-back list names only pins of this repository, each with a reason and a lifting condition", () => {
  const heldBack = JSON.parse(
    readFileSync(join(repositoryRoot, heldBackFile), "utf8"),
  ) as HeldBack[];
  const names = pinsOf({
    catalog: catalogVersions(),
    packageManager: rootManifest.packageManager ?? "",
    nodeRange: rootManifest.engines?.node ?? "",
  }).map(({ name }) => name);

  expect(Array.isArray(heldBack)).toBe(true);
  expect(heldBack.filter(({ name }) => !names.includes(name))).toEqual([]);
  expect(heldBack.filter(({ reason, lift }) => !reason?.trim() || !lift?.trim())).toEqual([]);
});

test(`${workspaceFile} sets minimumReleaseAge, so pnpm and the newest-release check read one release age, and makes pnpm refuse a younger release rather than exempt it`, () => {
  const workspace = readFileSync(join(repositoryRoot, workspaceFile), "utf8");

  expect(workspace).toMatch(/^minimumReleaseAge: \d+$/m);
  expect(workspace).toMatch(/^minimumReleaseAgeStrict: true$/m);
});
