import { expect, test } from "vite-plus/test";
import {
  exactlyRequiredNames,
  newestSolidReleases,
  releaseParts,
  solidCatalogMove,
} from "#/scripts/solid-2-release.ts";
import {
  type Listing,
  now,
  policy,
  registryDocument,
  solidLine,
} from "#/tests/support/registry-fixtures.ts";

const releases: Listing[] = [
  ["2.0.0", 20],
  ["2.0.1", 3],
];

test("the Solid 2 canary takes each Solid package's own newest release old enough to install, so a package with no newer release stays on its own", () => {
  const documents = solidLine(() => "*", [...releases, ["2.0.2", 2]]);
  documents["@solidjs/compiler"] = registryDocument(releases);

  expect(newestSolidReleases(documents, policy, now)).toEqual({
    "solid-js": "2.0.2",
    "@solidjs/web": "2.0.2",
    "@solidjs/compiler": "2.0.1",
    "@solidjs/signals": "2.0.2",
  });
});

test("the Solid 2 canary steps a package down while a release another Solid package needs is too young, or its peer range refuses the release taken", () => {
  const signalsTooYoung = solidLine((version) => `^${version}`, releases);
  signalsTooYoung["solid-js"] = registryDocument([
    ["2.0.0", 20, { dependencies: { "@solidjs/signals": "^2.0.0" } }],
    ["2.0.1", 3, { dependencies: { "@solidjs/signals": "^2.0.1" } }],
  ]);
  signalsTooYoung["@solidjs/signals"] = registryDocument([
    ["2.0.0", 20],
    ["2.0.1", 0.25],
  ]);

  expect(newestSolidReleases(signalsTooYoung, policy, now)).toEqual({
    "solid-js": "2.0.0",
    "@solidjs/web": "2.0.0",
    "@solidjs/compiler": "2.0.1",
    "@solidjs/signals": "2.0.0",
  });
});

test("the Solid 2 canary refuses a range it cannot read, fails by name when the registry answer holds no document for a Solid package, and says when a package has no release that will do", () => {
  const unreadable = solidLine((version) => (version === "2.0.1" ? "workspace:^" : "*"), releases);

  expect(() => newestSolidReleases(unreadable, policy, now)).toThrow(
    '@solidjs/web@2.0.1: its range "workspace:^" for solid-js is not a semver range',
  );
  expect(() => newestSolidReleases({}, policy, now)).toThrow(
    "solid-js: the registry answer holds no document for solid-js.",
  );
  expect(() =>
    newestSolidReleases(
      solidLine(() => "*", []),
      policy,
      now,
    ),
  ).toThrow(
    "solid-js: no stable Solid 2 release is old enough to install, with every release it lists at an exact version old enough too, and accepted by the ranges of the other Solid packages.",
  );
});

function withBuilds(listings: Listing[], builds: Listing[]) {
  return {
    ...solidLine(
      () => "*",
      listings,
      (version) => ({
        optionalDependencies: { "a-compiler-build": version, "a-range": `^${version}` },
      }),
    ),
    "a-compiler-build": registryDocument(builds),
  };
}

test("the Solid 2 canary waits until every release a Solid package lists at an exact version is old enough too, and fails by name when the registry answer holds no document for one", () => {
  const buildTooYoung = withBuilds(releases, [
    ["2.0.0", 20],
    ["2.0.1", 0.5],
  ]);
  const { "a-compiler-build": _dropped, ...noBuildDocument } = buildTooYoung;

  expect(exactlyRequiredNames(buildTooYoung)).toEqual(["a-compiler-build"]);
  expect(newestSolidReleases(buildTooYoung, policy, now)["@solidjs/compiler"]).toBe("2.0.0");
  expect(newestSolidReleases(buildTooYoung, policy, now)["solid-js"]).toBe("2.0.1");
  expect(
    newestSolidReleases(withBuilds(releases, releases), policy, now)["@solidjs/compiler"],
  ).toBe("2.0.1");
  expect(() => newestSolidReleases(noBuildDocument, policy, now)).toThrow(
    "a-compiler-build: the registry answer holds no document for a-compiler-build.",
  );
});

test("the Solid 2 canary takes the newest stable 2.x release, not a 2.x prerelease and not a Solid 3 prerelease", () => {
  const listings: Listing[] = [
    ["2.0.0-rc.22", 30],
    ["2.0.0", 20],
    ["2.0.1", 10],
    ["3.0.0-alpha.1", 5],
  ];

  expect(
    Object.values(
      newestSolidReleases(
        solidLine(() => "*", listings),
        policy,
        now,
      ),
    ),
  ).toEqual(["2.0.1", "2.0.1", "2.0.1", "2.0.1"]);
});

test("the releases a Solid package's version installs are that package at that version and every release it lists at an exact version there", () => {
  const documents = withBuilds([["2.0.1", 3]], [["2.0.1", 3]]);

  expect(releaseParts(documents, "@solidjs/compiler", "2.0.1")).toEqual([
    { name: "@solidjs/compiler", version: "2.0.1" },
    { name: "a-compiler-build", version: "2.0.1" },
  ]);
});

test("the canary moves each Solid package of the catalog to the release it takes, and says so", () => {
  const documents = solidLine(() => "*", [...releases, ["2.0.2", 2]]);
  documents["@solidjs/compiler"] = registryDocument(releases);

  expect(solidCatalogMove(documents, policy, now)).toEqual({
    versions: {
      "solid-js": "2.0.2",
      "@solidjs/web": "2.0.2",
      "@solidjs/compiler": "2.0.1",
      "@solidjs/signals": "2.0.2",
    },
    summary:
      "solid-js -> 2.0.2, @solidjs/web -> 2.0.2, @solidjs/compiler -> 2.0.1, @solidjs/signals -> 2.0.2",
  });
});

test("a published version with no publish time stops the canary by name", () => {
  const noTime = registryDocument([["2.0.0", 10]]);
  noTime.versions = { ...noTime.versions, "2.0.1": {} };

  expect(() =>
    newestSolidReleases(
      { ...solidLine(() => "*", [["2.0.0", 10]]), "solid-js": noTime },
      policy,
      now,
    ),
  ).toThrow("solid-js: the registry gives no publish time for solid-js@2.0.1");
});
