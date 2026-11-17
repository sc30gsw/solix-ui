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
} from "#/scripts/newest-releases.ts";
import { listed, unique } from "#/scripts/repository.ts";

type Documents = Record<string, RegistryDocument>;

function stableSolidVersions(documents: Documents): string[] {
  return unique(
    solidPackages.flatMap((name) =>
      Object.keys(documents[name]?.versions ?? {}).filter(
        (version) => semver.valid(version) !== null && isStableOnMajor(version, solidMajor),
      ),
    ),
  );
}

export function solidReleaseParts(documents: Documents, version: string): Release[] {
  return solidPackages.flatMap((name) => [
    { name, version },
    ...exactlyRequiredBy(documents[name]?.versions?.[version]),
  ]);
}

export function exactlyRequiredNames(documents: Documents): string[] {
  return unique(
    stableSolidVersions(documents).flatMap((version) =>
      solidReleaseParts(documents, version)
        .map(({ name }) => name)
        .filter((name) => !solidPackages.includes(name)),
    ),
  );
}

function releasedTogether(documents: Documents, policy: ReleasePolicy): Published[] {
  const publishedOf = (name: string): Published[] => {
    const published = publishedIn(name, documents[name], policy);
    if (!Array.isArray(published)) throw new Error(`${name}: ${published.why}`);
    return published;
  };
  for (const name of solidPackages) publishedOf(name);
  return stableSolidVersions(documents).flatMap((version) => {
    const parts = solidReleaseParts(documents, version).map(
      (part) =>
        publishedOf(part.name).find((release) => release.version === part.version)?.eligibleAt,
    );
    const known = parts.filter((eligibleAt) => eligibleAt !== undefined);
    return known.length === parts.length ? [{ version, eligibleAt: Math.max(...known) }] : [];
  });
}

function solidPeersAccept(documents: Documents, version: string): boolean {
  return solidPackages.every((name) =>
    Object.entries(documents[name]?.versions?.[version]?.peerDependencies ?? {})
      .filter(([peer]) => solidPackages.includes(peer))
      .every(([peer, range]) => {
        if (semver.validRange(range) === null) {
          throw new Error(
            `${name}@${version}: its peer range "${range}" for ${peer} is not a semver range, so nothing tells whether it accepts ${version}.`,
          );
        }
        return semver.satisfies(version, range);
      }),
  );
}

export function newestSolidRelease(
  documents: Documents,
  policy: ReleasePolicy,
  now: number,
): string {
  const release = newestFirst(releasedTogether(documents, policy))
    .filter(({ eligibleAt }) => eligibleAt <= now)
    .find(({ version }) => solidPeersAccept(documents, version));
  if (release === undefined) {
    throw new Error(
      `No stable Solid ${solidMajor} release is published for ${listed(solidPackages)} alike, with every release they list at an exact version, old enough to install and accepted by their peer ranges.`,
    );
  }
  return release.version;
}

export function solidCatalogMove(
  documents: Documents,
  policy: ReleasePolicy,
  now: number,
): { versions: Record<string, string>; summary: string } {
  const version = newestSolidRelease(documents, policy, now);
  return {
    versions: Object.fromEntries(solidPackages.map((name) => [name, version])),
    summary: `${listed(solidPackages)} -> ${version}`,
  };
}
