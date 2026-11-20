import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BANNED_DEPS, doctorFindings } from "solid2-agent-kit/bin/doctor.mjs";
import { expect, test } from "vite-plus/test";
import { pnpmSettings, workspaceFile } from "#/scripts/pnpm-settings.ts";
import { manifestPaths } from "#/scripts/repository.ts";
import { repositoryRoot } from "#/tests/support/workspace.ts";

const dependencyLists = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;
const catalogVersion = "catalog:";
const removedByPnpm = "-";
const neededByStorybook = "react";
const fixtures = "tests/fixtures/solid-dependencies";

type Manifest = Partial<Record<(typeof dependencyLists)[number], Record<string, string>>>;
type Finding = { list: string; id: string; message: string };

function doctorFindingsOf(manifest: Manifest): Finding[] {
  const { catalog } = pnpmSettings();
  return dependencyLists.flatMap((list) => {
    const versions = manifest[list];
    if (versions === undefined) return [];
    const root = mkdtempSync(join(tmpdir(), "kit-doctor-"));
    try {
      const dependencies = Object.fromEntries(
        Object.entries(versions).map(([name, version]) => [
          name,
          version === catalogVersion ? (catalog[name] ?? version) : version,
        ]),
      );
      writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies }));
      return doctorFindings(root).map(({ id, message }) => ({ list, id, message }));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

function manifestAt(path: string): Manifest {
  return JSON.parse(readFileSync(join(repositoryRoot, path), "utf8"));
}

test(`${workspaceFile} has pnpm remove from any install every package the kit's doctor bans, but react, which Storybook's icons need`, () => {
  const { overrides } = pnpmSettings();
  const removed = Object.keys(overrides).filter((name) => overrides[name] === removedByPnpm);

  expect(
    Object.keys(BANNED_DEPS).filter(
      (name) => name !== neededByStorybook && !removed.includes(name),
    ),
  ).toEqual([]);
});

test("every workspace manifest passes the kit's doctor, one dependency list at a time, with the catalog's versions", () => {
  const problems = manifestPaths().flatMap((path) =>
    doctorFindingsOf(manifestAt(path)).map(
      ({ list, id, message }) => `${path}: ${list}: [${id}] ${message}`,
    ),
  );

  expect(manifestPaths().length).toBeGreaterThan(1);
  expect(problems).toEqual([]);
});

test.each([
  ["react.json", ["devDependencies dep-react"]],
  ["solid-one-peer.json", ["peerDependencies solid-js-version"]],
])(
  "the kit's doctor fails the manifest %s with %j, so the check above can fail",
  (fixture, ids) => {
    expect(
      doctorFindingsOf(manifestAt(`${fixtures}/${fixture}`)).map(({ list, id }) => `${list} ${id}`),
    ).toEqual(ids);
  },
);
