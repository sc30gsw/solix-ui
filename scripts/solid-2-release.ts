import semver from "semver";
import {
  exactlyRequiredBy,
  isStableOnMajor,
  newestFirst,
  type Published,
  publishedIn,
  type RegistryDocument,
  type Release,
  type ReleasePolicy,
  solidMajor,
  solidPackages,
  type VersionManifest,
} from "#/scripts/newest-releases.ts";
import { unique } from "#/scripts/repository.ts";

type Documents = Record<string, RegistryDocument>;

function manifestOf(documents: Documents, name: string, version: string) {
  return documents[name]?.versions?.[version];
}

function stableVersionsOf(documents: Documents, name: string): string[] {
  return Object.keys(documents[name]?.versions ?? {}).filter(
    (version) => semver.valid(version) !== null && isStableOnMajor(version, solidMajor),
  );
}

export function releaseParts(documents: Documents, name: string, version: string): Release[] {
  return [{ name, version }, ...exactlyRequiredBy(manifestOf(documents, name, version))];
}

export function exactlyRequiredNames(documents: Documents): string[] {
  return unique(
    solidPackages.flatMap((name) =>
      stableVersionsOf(documents, name).flatMap((version) =>
        releaseParts(documents, name, version)
          .map((part) => part.name)
          .filter((part) => !solidPackages.includes(part)),
      ),
    ),
  );
}

function publishedOf(documents: Documents, name: string, policy: ReleasePolicy): Published[] {
  const published = publishedIn(name, documents[name], policy);
  if (!Array.isArray(published)) throw new Error(`${name}: ${published.why}`);
  return published;
}

function candidatesOf(
  documents: Documents,
  name: string,
  policy: ReleasePolicy,
  now: number,
): string[] {
  const oldEnough = (part: Release) =>
    publishedOf(documents, part.name, policy).some(
      (release) => release.version === part.version && release.eligibleAt <= now,
    );
  return newestFirst(publishedOf(documents, name, policy))
    .map(({ version }) => version)
    .filter((version) => isStableOnMajor(version, solidMajor))
    .filter((version) => releaseParts(documents, name, version).every(oldEnough));
}

export function solidRanges(manifest: VersionManifest | undefined): [string, string][] {
  return Object.entries({
    ...manifest?.dependencies,
    ...manifest?.optionalDependencies,
    ...manifest?.peerDependencies,
  }).filter(([other]) => solidPackages.includes(other));
}

function refusesTaken(
  documents: Documents,
  name: string,
  version: string,
  taken: Record<string, string>,
): boolean {
  return solidRanges(manifestOf(documents, name, version)).some(([other, range]) => {
    if (semver.validRange(range) === null) {
      throw new Error(
        `${name}@${version}: its range "${range}" for ${other} is not a semver range, so nothing tells whether it accepts the ${other} release taken.`,
      );
    }
    return !semver.satisfies(taken[other] ?? "", range);
  });
}

export function newestSolidReleases(
  documents: Documents,
  policy: ReleasePolicy,
  now: number,
): Record<string, string> {
  const candidates = Object.fromEntries(
    solidPackages.map((name) => [name, candidatesOf(documents, name, policy, now)]),
  );
  const taken = (): Record<string, string> =>
    Object.fromEntries(solidPackages.map((name) => [name, candidates[name]?.[0] ?? ""]));
  for (;;) {
    const exhausted = solidPackages.find((name) => candidates[name]?.length === 0);
    if (exhausted !== undefined) {
      throw new Error(
        `${exhausted}: no stable Solid ${solidMajor} release is old enough to install, with every release it lists at an exact version old enough too, and accepted by the ranges of the other Solid packages.`,
      );
    }
    const chosen = taken();
    const refusing = solidPackages.find((name) =>
      refusesTaken(documents, name, chosen[name] ?? "", chosen),
    );
    if (refusing === undefined) return chosen;
    candidates[refusing]?.shift();
  }
}

export function solidCatalogMove(
  documents: Documents,
  policy: ReleasePolicy,
  now: number,
): { versions: Record<string, string>; summary: string } {
  const versions = newestSolidReleases(documents, policy, now);
  return {
    versions,
    summary: Object.entries(versions)
      .map(([name, version]) => `${name} -> ${version}`)
      .join(", "),
  };
}
