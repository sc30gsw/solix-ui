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

function publishedOf(documents: Documents, policy: ReleasePolicy): (name: string) => Published[] {
  const known = new Map<string, Published[]>();
  return (name) => {
    const published = known.get(name) ?? publishedIn(name, documents[name], policy);
    if (!Array.isArray(published)) throw new Error(`${name}: ${published.why}`);
    known.set(name, published);
    return published;
  };
}

function candidatesOf(
  documents: Documents,
  published: (name: string) => Published[],
  name: string,
  now: number,
): string[] {
  const oldEnough = (part: Release) =>
    published(part.name).some(
      (release) => release.version === part.version && release.eligibleAt <= now,
    );
  return newestFirst(published(name))
    .map(({ version }) => version)
    .filter((version) => isStableOnMajor(version, solidMajor))
    .filter((version) => releaseParts(documents, name, version).every(oldEnough));
}

export function solidRanges(manifest: VersionManifest | undefined): [string, string][] {
  return [manifest?.dependencies, manifest?.optionalDependencies, manifest?.peerDependencies]
    .flatMap((ranges) => Object.entries(ranges ?? {}))
    .filter(([other]) => solidPackages.includes(other));
}

type Refusal = { from: "below" | "above"; why: string };

function refusalOf(
  documents: Documents,
  name: string,
  version: string,
  taken: Record<string, string>,
): Refusal | undefined {
  for (const [other, range] of solidRanges(manifestOf(documents, name, version))) {
    const theirs = taken[other] ?? "";
    if (semver.validRange(range) === null) {
      throw new Error(
        `${name}@${version}: its range "${range}" for ${other} is not a semver range, so nothing tells whether it accepts the ${other} release taken.`,
      );
    }
    if (!semver.satisfies(theirs, range)) {
      return {
        from: semver.gtr(theirs, range) ? "above" : "below",
        why: `${name}@${version}: its range "${range}" for ${other} refuses ${other}@${theirs}`,
      };
    }
  }
  return undefined;
}

export function newestSolidReleases(
  documents: Documents,
  policy: ReleasePolicy,
  now: number,
): Record<string, string> {
  const published = publishedOf(documents, policy);
  const candidates = Object.fromEntries(
    solidPackages.map((name) => [name, candidatesOf(documents, published, name, now)]),
  );
  for (;;) {
    const exhausted = solidPackages.find((name) => candidates[name]?.length === 0);
    if (exhausted !== undefined) {
      throw new Error(
        `${exhausted}: no stable Solid ${solidMajor} release is old enough to install, with every release it lists at an exact version old enough too, whose own ranges accept the releases the other Solid packages take.`,
      );
    }
    const taken = Object.fromEntries(
      solidPackages.map((name) => [name, candidates[name]?.[0] ?? ""]),
    );
    const refusing = solidPackages.find(
      (name) => refusalOf(documents, name, taken[name] ?? "", taken) !== undefined,
    );
    if (refusing === undefined) return taken;
    const left = (candidates[refusing] ?? []).map((version) =>
      refusalOf(documents, refusing, version, taken),
    );
    if (left.every((refusal) => refusal?.from === "above")) {
      throw new Error(
        `${left[0]?.why} from above, and so does every older release of ${refusing} that is left. The canary steps back only the package whose own range refuses, which assumes that a Solid package's range for another has no upper bound below that package's newest release. Pick these releases by hand.`,
      );
    }
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
