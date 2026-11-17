import semver from "semver";
import { listed } from "#/scripts/repository.ts";

export const heldBackFile = "scripts/held-back-releases.json";
export const packageManagerPinName = "packageManager";
export const nodePinName = "engines.node";

type VersionManifest = {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

export type RegistryDocument = {
  versions?: Record<string, VersionManifest>;
  time?: Record<string, string>;
};

export type NodeRelease = { version: string; lts: string | false };

type RegistryPin = { source: "registry"; name: string; registryName: string; pinned: string };

export type Pin = RegistryPin | { source: "node"; name: typeof nodePinName; pinned: string };

export type HeldBack = { name: string; reason: string; liftWhen: string };

export type Exclusion = { name: string; version: string };

export type ReleasePolicy = {
  minimumReleaseAgeMinutes: number;
  excluded: readonly Exclusion[];
};

type Compared = { pin: Pin; channel: string; newest: string };

export type PinComparison =
  | (Compared & { status: "current" })
  | (Compared & { status: "behind"; eligible: string })
  | (Compared & { status: "held back"; eligible: string; held: HeldBack })
  | (Compared & { status: "not yet eligible"; eligibleAt: string })
  | { pin: Pin; channel: string; status: "unknown"; why: string };

export type Report = { comparisons: PinComparison[]; problems: string[] };

export type Published = { version: string; eligibleAt: number };

type Releases = {
  newest: string;
  eligible: string | undefined;
  eligibleAt: string | undefined;
};

type Unknown = { why: string };

type ChannelContext = { pinned: string; nodeLtsMajor: number | undefined; now: number };

type Channel = {
  describe: string;
  versions: (published: readonly Published[], context: ChannelContext) => Published[];
};

const minute = 60_000;
const solidMajor = 2;
const aliasedPackage = /^npm:((?:@[^/@]+\/)?[^@]+)@(.+)$/;
const packageAndVersion = /^((?:@[^/@]+\/)?[^@]+)@(.+)$/;
const packageName = /^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/;
const nodeChannel = "Node's newest LTS";

export function isStable({ version }: Published): boolean {
  return semver.prerelease(version) === null;
}

function prereleaseIdentifier(version: string): string {
  return String(semver.prerelease(version)?.[0]);
}

function carriesTheIdentifierOf(pinned: string, { version }: Published): boolean {
  return prereleaseIdentifier(version) === prereleaseIdentifier(pinned);
}

function isOnTheVersionOf(pinned: string, { version }: Published): boolean {
  return (
    semver.major(version) === semver.major(pinned) &&
    semver.minor(version) === semver.minor(pinned) &&
    semver.patch(version) === semver.patch(pinned)
  );
}

function stableOnMajor(published: readonly Published[], major: number): Published[] {
  return published.filter(
    (release) => isStable(release) && semver.major(release.version) === major,
  );
}

const stableChannel: Channel = {
  describe: "its newest stable release",
  versions: (published) => published.filter(isStable),
};
const prereleasePinChannel: Channel = {
  describe:
    "its newest stable release, or the newest prerelease of the version it pins that carries the identifier of the pin, such as beta; while it has no stable release, its newest prerelease of any version that carries that identifier",
  versions: (published, { pinned }) =>
    published.some(isStable)
      ? published.filter(
          (release) =>
            isStable(release) ||
            (isOnTheVersionOf(pinned, release) && carriesTheIdentifierOf(pinned, release)),
        )
      : published.filter((release) => carriesTheIdentifierOf(pinned, release)),
};
const solidChannel: Channel = {
  describe: `the newest stable Solid ${solidMajor} release`,
  versions: (published) => stableOnMajor(published, solidMajor),
};

export const channels: Record<string, Channel> = {
  "solid-js": solidChannel,
  "@solidjs/web": solidChannel,
  "@solidjs/compiler": solidChannel,
  "@solidjs/signals": solidChannel,
  "@solidjs/vite-plugin": {
    describe: "its newest stable release on the major it pins",
    versions: (published, { pinned }) => stableOnMajor(published, semver.major(pinned)),
  },
  "@types/node": {
    describe: "its newest stable release on the major of Node's newest LTS",
    versions: (published, { nodeLtsMajor }) =>
      published.filter(
        (release) => isStable(release) && semver.major(release.version) === nodeLtsMajor,
      ),
  },
};

export const solidPackages = Object.keys(channels).filter(
  (name) => channels[name] === solidChannel,
);

function channelOf({ registryName, pinned }: RegistryPin): Channel {
  return (
    channels[registryName] ??
    (semver.prerelease(pinned) === null ? stableChannel : prereleasePinChannel)
  );
}

function lowestVersion(where: string, specifier: string | undefined): string {
  if (specifier === undefined) throw new Error(`${where}: set it to a version or range.`);
  const version =
    semver.validRange(specifier) === null ? undefined : semver.minVersion(specifier)?.version;
  if (version === undefined) throw new Error(`${where}: "${specifier}" names no version.`);
  return version;
}

export function pinsOf(
  manifest: { packageManager?: string; engines?: { node?: string } },
  catalog: Record<string, string>,
): Pin[] {
  const fromCatalog = Object.entries(catalog).map(([name, specifier]): Pin => {
    const alias = aliasedPackage.exec(specifier);
    return {
      source: "registry",
      name,
      registryName: alias ? alias[1] : name,
      pinned: lowestVersion(`catalog entry ${name}`, alias ? alias[2] : specifier),
    };
  });
  const [, manager, managerVersion] =
    manifest.packageManager === undefined
      ? []
      : (packageAndVersion.exec(manifest.packageManager) ?? []);
  if (manager === undefined) {
    throw new Error(`package.json: set packageManager to <name>@<version>.`);
  }
  return [
    ...fromCatalog,
    {
      source: "registry",
      name: packageManagerPinName,
      registryName: manager,
      pinned: lowestVersion(packageManagerPinName, managerVersion),
    },
    {
      source: "node",
      name: nodePinName,
      pinned: lowestVersion(nodePinName, manifest.engines?.node),
    },
  ];
}

export function exclusionsIn(entries: readonly string[]): Exclusion[] {
  return entries.map((entry) => {
    const [, name = "", version = ""] = packageAndVersion.exec(entry) ?? [];
    if (!packageName.test(name) || semver.valid(version) !== version) {
      throw new Error(
        `minimumReleaseAgeExclude: "${entry}" is not <name>@<exact version>. An exemption names the one release it is for.`,
      );
    }
    return { name, version };
  });
}

function isExcluded(registryName: string, version: string, policy: ReleasePolicy): boolean {
  return policy.excluded.some(
    (exclusion) => exclusion.name === registryName && exclusion.version === version,
  );
}

function publishedAt(document: RegistryDocument, version: string): number | undefined {
  const time = document.time?.[version];
  const at = time === undefined ? Number.NaN : Date.parse(time);
  return Number.isNaN(at) ? undefined : at;
}

export function publishedIn(
  registryName: string,
  document: RegistryDocument,
  policy: ReleasePolicy,
): Published[] | Unknown {
  const published: Published[] = [];
  const versions = Object.keys(document.versions ?? {}).filter(
    (version) => semver.valid(version) !== null,
  );
  for (const version of versions) {
    const at = publishedAt(document, version);
    if (at === undefined) {
      return {
        why: `the registry gives no publish time for ${registryName}@${version}, so its age cannot be told.`,
      };
    }
    const age = isExcluded(registryName, version, policy) ? 0 : policy.minimumReleaseAgeMinutes;
    published.push({ version, eligibleAt: at + age * minute });
  }
  return published;
}

export function newestFirst(published: readonly Published[]): Published[] {
  return published.toSorted((left, right) => semver.rcompare(left.version, right.version));
}

function releasesAmong(candidates: readonly Published[], now: number): Releases | undefined {
  const ordered = newestFirst(candidates);
  const newest = ordered.at(0);
  return (
    newest && {
      newest: newest.version,
      eligible: ordered.find(({ eligibleAt }) => eligibleAt <= now)?.version,
      eligibleAt: newest.eligibleAt <= now ? undefined : new Date(newest.eligibleAt).toISOString(),
    }
  );
}

function nodeLtsReleases(nodeReleases: readonly NodeRelease[]): Releases | undefined {
  const newest = nodeReleases
    .filter(({ lts }) => lts !== false)
    .flatMap(({ version }) => semver.clean(version) ?? [])
    .toSorted(semver.rcompare)
    .at(0);
  return newest === undefined ? undefined : { newest, eligible: newest, eligibleAt: undefined };
}

function registryReleases(
  pin: RegistryPin,
  document: RegistryDocument,
  policy: ReleasePolicy,
  context: ChannelContext,
): Releases | Unknown {
  const published = publishedIn(pin.registryName, document, policy);
  if (!Array.isArray(published)) return published;
  const channel = channelOf(pin);
  return (
    releasesAmong(channel.versions(published, context), context.now) ?? {
      why: `no published release is on its channel (${channel.describe}); check the name and the channel.`,
    }
  );
}

function compared(
  pin: Pin,
  channel: string,
  { newest, eligible, eligibleAt }: Releases,
  held: HeldBack | undefined,
): PinComparison {
  if (eligible !== undefined && semver.gt(eligible, pin.pinned)) {
    return held
      ? { pin, channel, newest, status: "held back", eligible, held }
      : { pin, channel, newest, status: "behind", eligible };
  }
  return eligibleAt !== undefined && semver.gt(newest, pin.pinned)
    ? { pin, channel, newest, status: "not yet eligible", eligibleAt }
    : { pin, channel, newest, status: "current" };
}

export function holdsOfNothing(
  heldBack: readonly HeldBack[],
  comparisons: readonly PinComparison[],
): string[] {
  return heldBack
    .filter(
      ({ name }) =>
        !comparisons.some(({ pin, status }) => pin.name === name && status === "held back"),
    )
    .map(
      ({ name }) => `${name}: the held-back list holds it, but it is not behind; remove the entry.`,
    );
}

export function holdsWithoutReason(heldBack: readonly HeldBack[]): string[] {
  return heldBack
    .filter(({ reason, liftWhen }) => !reason?.trim() || !liftWhen?.trim())
    .map(({ name }) => `${name}: give the entry in ${heldBackFile} a reason and a liftWhen.`);
}

export function registryNamesToFetch(pins: readonly Pin[], policy: ReleasePolicy): string[] {
  return [
    ...new Set([
      ...pins.flatMap((pin) => (pin.source === "registry" ? [pin.registryName] : [])),
      ...policy.excluded.map(({ name }) => name),
    ]),
  ];
}

export function outgrownExclusions(
  documents: Record<string, RegistryDocument>,
  policy: ReleasePolicy,
  now: number,
): string[] {
  return policy.excluded.flatMap(({ name, version }) => {
    const document = documents[name];
    if (document === undefined) {
      return [
        `${name}@${version}: the registry answer holds no document for ${name}, so nothing tells whether minimumReleaseAgeExclude still needs it.`,
      ];
    }
    const at = publishedAt(document, version);
    if (at === undefined) {
      return [
        `${name}@${version}: the registry gives no publish time for it, so nothing tells whether minimumReleaseAgeExclude still needs it.`,
      ];
    }
    return at + policy.minimumReleaseAgeMinutes * minute <= now
      ? [
          `${name}@${version}: it is older than minimumReleaseAge, so pnpm installs it without an exemption. Remove it from minimumReleaseAgeExclude.`,
        ]
      : [];
  });
}

export function compareWithNewest(input: {
  pins: readonly Pin[];
  documents: Record<string, RegistryDocument>;
  nodeReleases: readonly NodeRelease[];
  policy: ReleasePolicy;
  now: number;
  heldBack: readonly HeldBack[];
}): Report {
  const nodeLts = nodeLtsReleases(input.nodeReleases);
  const nodeLtsMajor = nodeLts && semver.major(nodeLts.newest);
  const comparisons = input.pins.map((pin): PinComparison => {
    const channel = pin.source === "node" ? nodeChannel : channelOf(pin).describe;
    const releases =
      pin.source === "node"
        ? (nodeLts ?? { why: "Node's release index lists no LTS release." })
        : registryReleases(pin, input.documents[pin.registryName] ?? {}, input.policy, {
            pinned: pin.pinned,
            nodeLtsMajor,
            now: input.now,
          });
    return "why" in releases
      ? { pin, channel, status: "unknown", why: releases.why }
      : compared(
          pin,
          channel,
          releases,
          input.heldBack.find(({ name }) => name === pin.name),
        );
  });
  const problems = [
    ...comparisons.flatMap((comparison) => {
      if (comparison.status === "behind") {
        return [
          `${comparison.pin.name}: ${comparison.pin.pinned} is behind ${comparison.eligible}, the newest release it may move to (${comparison.channel}). Move to it, or hold it back in ${heldBackFile} with a reason and a liftWhen.`,
        ];
      }
      return comparison.status === "unknown" ? [`${comparison.pin.name}: ${comparison.why}`] : [];
    }),
    ...holdsOfNothing(input.heldBack, comparisons),
    ...holdsWithoutReason(input.heldBack),
    ...outgrownExclusions(input.documents, input.policy, input.now),
  ];
  return { comparisons, problems };
}

export function reportTable(comparisons: readonly PinComparison[]): string {
  const rows = comparisons.map((comparison) => {
    const newest = comparison.status === "unknown" ? "?" : comparison.newest;
    const status =
      comparison.status === "not yet eligible"
        ? `not yet eligible, until ${comparison.eligibleAt}`
        : comparison.status === "held back"
          ? `held back: ${comparison.held.reason} Lift when ${comparison.held.liftWhen}`
          : comparison.status;
    return `| ${comparison.pin.name} | ${comparison.pin.pinned} | ${newest} | ${comparison.channel} | ${status} |`;
  });
  return [
    "| Pin | Pinned | Newest | Channel | Status |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

function exactlyRequiredBy(document: RegistryDocument | undefined, version: string): Exclusion[] {
  const manifest = document?.versions?.[version];
  return Object.entries({ ...manifest?.dependencies, ...manifest?.optionalDependencies })
    .filter(([, specifier]) => semver.valid(specifier) === specifier)
    .map(([name, required]) => ({ name, version: required }));
}

function exactlyRequiredBySolid(
  documents: Record<string, RegistryDocument>,
  version: string,
): Exclusion[] {
  return solidPackages.flatMap((name) => exactlyRequiredBy(documents[name], version));
}

export function solidBuildNames(documents: Record<string, RegistryDocument>): string[] {
  return [
    ...new Set(
      solidPackages.flatMap((name) =>
        Object.keys(documents[name]?.versions ?? {})
          .filter((version) => semver.valid(version) !== null)
          .filter((version) => stableOnMajor([{ version, eligibleAt: 0 }], solidMajor).length > 0)
          .flatMap((version) =>
            exactlyRequiredBy(documents[name], version).map(({ name: build }) => build),
          ),
      ),
    ),
  ];
}

function publishedOf(
  name: string,
  documents: Record<string, RegistryDocument>,
  policy: ReleasePolicy,
): Published[] {
  const document = documents[name];
  if (document === undefined) {
    throw new Error(`${name}: the registry answer holds no document for it.`);
  }
  const published = publishedIn(name, document, policy);
  if (!Array.isArray(published)) throw new Error(`${name}: ${published.why}`);
  return published;
}

function publishedForEachSolidPackage(
  documents: Record<string, RegistryDocument>,
  policy: ReleasePolicy,
): Published[] {
  const [first = [], ...others] = solidPackages.map((name) => publishedOf(name, documents, policy));
  return stableOnMajor(first, solidMajor).flatMap(({ version, eligibleAt }) => {
    const elsewhere = [
      ...others.flatMap(
        (published) => published.find((release) => release.version === version) ?? [],
      ),
      ...exactlyRequiredBySolid(documents, version).flatMap(
        (build) =>
          publishedOf(build.name, documents, policy).find(
            (release) => release.version === build.version,
          ) ?? [],
      ),
    ];
    return elsewhere.length === others.length + exactlyRequiredBySolid(documents, version).length
      ? [
          {
            version,
            eligibleAt: Math.max(eligibleAt, ...elsewhere.map((release) => release.eligibleAt)),
          },
        ]
      : [];
  });
}

function solidPeersAccept(documents: Record<string, RegistryDocument>, version: string): boolean {
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
  documents: Record<string, RegistryDocument>,
  policy: ReleasePolicy,
  now: number,
): string {
  const release = newestFirst(publishedForEachSolidPackage(documents, policy))
    .filter(({ eligibleAt }) => eligibleAt <= now)
    .find(({ version }) => solidPeersAccept(documents, version));
  if (release === undefined) {
    throw new Error(
      `No stable Solid ${solidMajor} release is published for ${listed(solidPackages)} alike, with every build they require at that version, old enough to install and accepted by their peer ranges.`,
    );
  }
  return release.version;
}

export function staleSolidExemptions(
  documents: Record<string, RegistryDocument>,
  policy: ReleasePolicy,
  from: string,
  to: string,
): string[] {
  const kept = [
    ...solidPackages.map((name) => ({ name, version: to })),
    ...exactlyRequiredBySolid(documents, to),
  ];
  const solidNames = new Set([
    ...solidPackages,
    ...exactlyRequiredBySolid(documents, from).map(({ name }) => name),
    ...kept.map(({ name }) => name),
  ]);
  return policy.excluded
    .filter(
      ({ name, version }) =>
        solidNames.has(name) &&
        !kept.some((release) => release.name === name && release.version === version),
    )
    .map(
      ({ name, version }) =>
        `${name}@${version}: minimumReleaseAgeExclude exempts it, and the canary would move the Solid packages to ${to}, which does not install it. Remove the exemption first: the canary does not edit the list, so that the weekly run never blames Solid for a stale exemption.`,
    );
}
