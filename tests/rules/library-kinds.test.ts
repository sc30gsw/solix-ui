import { expect, test } from "vite-plus/test";
import {
  installedDependencies,
  libraryHome,
  libraryKindNames,
  libraryKinds,
  libraryList,
  libraryNames,
  libraryPackages,
  listedButAbsent,
  ownLibraryPeerRange,
  unlistedLibraries,
} from "#/tests/support/workspace.ts";

const ownLibraryLink = "workspace:*";

test(`every package in ${libraryHome} is a library that ${libraryList} lists with its kind, and the list names no other directory`, () => {
  expect([
    ...unlistedLibraries.map(
      (directory) =>
        `${directory}: list it in ${libraryList} as a library of the ${new Intl.ListFormat("en", { type: "disjunction" }).format(libraryKindNames)} kind.`,
    ),
    ...listedButAbsent.map(
      (directory) =>
        `${directory}: ${libraryList} lists it, but no package is there. Remove it from the list.`,
    ),
  ]).toEqual([]);
});

test("a library names as a peer, or as a library of this repository in any dependency list, only what its kind allows", () => {
  const violations = libraryPackages.flatMap(({ path, kind: libraryKind, manifest }) => {
    const { what: kind, allowedNames: allowed } = libraryKinds[libraryKind];
    const named = [
      ...Object.keys(manifest.peerDependencies ?? {}),
      ...installedDependencies(manifest)
        .map(([name]) => name)
        .filter((name) => libraryNames.includes(name)),
    ];
    return [...new Set(named)]
      .filter((name) => !allowed.includes(name))
      .map(
        (name) =>
          `${path}: package "${manifest.name}" names "${name}", which ${kind} may not. It may name only ${allowed.join(", ")}.`,
      );
  });

  expect(libraryPackages.length).toBeGreaterThan(1);
  expect(violations).toEqual([]);
});

test("a library names another library of this repository as a workspace:^ peer, linked as a workspace:* devDependency", () => {
  const violations = libraryPackages.flatMap(({ path, manifest }) =>
    Object.entries(manifest.peerDependencies ?? {})
      .filter(([name]) => libraryNames.includes(name))
      .flatMap(([name, range]) => [
        ...(range === ownLibraryPeerRange
          ? []
          : [
              `${path}: write the peer "${name}" as "${ownLibraryPeerRange}", so publishing pins the version this workspace builds against.`,
            ]),
        ...(manifest.devDependencies?.[name] === ownLibraryLink
          ? []
          : [
              `${path}: add "${name}": "${ownLibraryLink}" to devDependencies, so the workspace links the library it names as a peer.`,
            ]),
      ]),
  );

  expect(violations).toEqual([]);
});
