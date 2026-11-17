import { expect, test } from "vite-plus/test";
import {
  newestSolidRelease,
  exactlyRequiredNames,
  solidCatalogMove,
  solidReleaseParts,
} from "#/scripts/solid-2-release.ts";
import {
  type Listing,
  now,
  policy,
  registryDocument,
  solidLine,
} from "#/tests/support/registry-fixtures.ts";

test("the Solid 2 canary takes one release for every Solid package, old enough for each and accepted by their peer ranges", () => {
  const lockstep = solidLine(
    (version) => `^${version}`,
    [
      ["2.0.0", 20],
      ["2.0.1", 2],
    ],
  );
  lockstep["solid-js"] = registryDocument([
    ["2.0.0", 20],
    ["2.0.1", 0.25],
  ]);
  const peerTooNew = solidLine(
    (version) => (version === "2.0.1" ? "^2.0.2" : "*"),
    [
      ["2.0.0", 20],
      ["2.0.1", 2],
    ],
  );

  const webTooYoung = {
    "solid-js": lockstep["@solidjs/web"],
    "@solidjs/web": lockstep["solid-js"],
    "@solidjs/compiler": lockstep["@solidjs/compiler"],
    "@solidjs/signals": lockstep["@solidjs/signals"],
  };

  expect(newestSolidRelease(lockstep, policy, now)).toBe("2.0.0");
  expect(newestSolidRelease(webTooYoung, policy, now)).toBe("2.0.0");
  expect(newestSolidRelease(peerTooNew, policy, now)).toBe("2.0.0");
  expect(
    newestSolidRelease(
      lockstep,
      { ...policy, exempted: [{ name: "solid-js", version: "2.0.1" }] },
      now,
    ),
  ).toBe("2.0.1");
});

test("the Solid 2 canary refuses a peer range it cannot read instead of passing over that release, fails by name when the registry answer holds no document for a Solid package, and says when no release will do", () => {
  const unreadable = solidLine(
    (version) => (version === "2.0.1" ? "workspace:^" : "*"),
    [
      ["2.0.0", 20],
      ["2.0.1", 2],
    ],
  );

  expect(() => newestSolidRelease(unreadable, policy, now)).toThrow(
    '@solidjs/web@2.0.1: its peer range "workspace:^" for solid-js is not a semver range',
  );
  expect(() => newestSolidRelease({}, policy, now)).toThrow(
    "solid-js: the registry answer holds no document for solid-js.",
  );
  expect(() =>
    newestSolidRelease(
      solidLine(() => "*", []),
      policy,
      now,
    ),
  ).toThrow(
    "No stable Solid 2 release is published for solid-js, @solidjs/web, @solidjs/compiler and @solidjs/signals alike, with every release they list at an exact version, old enough to install and accepted by their peer ranges.",
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
  const releases: Listing[] = [
    ["2.0.0", 20],
    ["2.0.1", 3],
  ];
  const buildTooYoung = withBuilds(releases, [
    ["2.0.0", 20],
    ["2.0.1", 0.5],
  ]);
  const { "a-compiler-build": _dropped, ...noBuildDocument } = buildTooYoung;

  expect(exactlyRequiredNames(buildTooYoung)).toEqual(["a-compiler-build"]);
  expect(newestSolidRelease(buildTooYoung, policy, now)).toBe("2.0.0");
  expect(
    newestSolidRelease(
      buildTooYoung,
      { ...policy, exempted: [{ name: "a-compiler-build", version: "2.0.1" }] },
      now,
    ),
  ).toBe("2.0.1");
  expect(newestSolidRelease(withBuilds(releases, releases), policy, now)).toBe("2.0.1");
  expect(newestSolidRelease(withBuilds(releases, [["2.0.0", 20]]), policy, now)).toBe("2.0.0");
  expect(() => newestSolidRelease(noBuildDocument, policy, now)).toThrow(
    "a-compiler-build: the registry answer holds no document for a-compiler-build.",
  );
});

test("the Solid 2 canary takes the newest stable 2.x release, not a 2.x prerelease and not a Solid 3 prerelease", () => {
  const releases: Listing[] = [
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

test("the releases a Solid version installs are the four Solid packages at that version and every release one of them lists at an exact version there", () => {
  const documents = withBuilds([["2.0.1", 3]], [["2.0.1", 3]]);

  expect(solidReleaseParts(documents, "2.0.1")).toEqual([
    { name: "solid-js", version: "2.0.1" },
    { name: "@solidjs/web", version: "2.0.1" },
    { name: "@solidjs/compiler", version: "2.0.1" },
    { name: "a-compiler-build", version: "2.0.1" },
    { name: "@solidjs/signals", version: "2.0.1" },
  ]);
});

test("the canary moves every Solid package of the catalog to the one release it takes, and says so", () => {
  const documents = withBuilds(
    [
      ["2.0.0", 20],
      ["2.0.1", 3],
    ],
    [
      ["2.0.0", 20],
      ["2.0.1", 3],
    ],
  );

  expect(solidCatalogMove(documents, policy, now)).toEqual({
    versions: {
      "solid-js": "2.0.1",
      "@solidjs/web": "2.0.1",
      "@solidjs/compiler": "2.0.1",
      "@solidjs/signals": "2.0.1",
    },
    summary: "solid-js, @solidjs/web, @solidjs/compiler and @solidjs/signals -> 2.0.1",
  });
});

test("a published version with no publish time stops the canary by name", () => {
  const noTime = registryDocument([["2.0.0", 10]]);
  noTime.versions = { ...noTime.versions, "2.0.1": {} };

  expect(() =>
    newestSolidRelease(
      { ...solidLine(() => "*", [["2.0.0", 10]]), "solid-js": noTime },
      policy,
      now,
    ),
  ).toThrow("solid-js: the registry gives no publish time for solid-js@2.0.1");
});
