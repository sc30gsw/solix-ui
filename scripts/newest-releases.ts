import semver from "semver";

export type RegistryDocument = {
  "dist-tags"?: Record<string, string>;
  time?: Record<string, string>;
};

export type NodeRelease = { version: string; lts: string | false };

export type Pin = { name: string; registryName: string | undefined; pinned: string | undefined };

export type HeldBack = { name: string; reason: string; lift: string };

export type Status = "current" | "behind" | "not yet eligible" | "held back" | "unknown";

export type Row = Pin & {
  newest: string | undefined;
  eligible: string | undefined;
  eligibleAt: string | undefined;
  channel: string;
  status: Status;
  held: HeldBack | undefined;
};

type Context = {
  documents: Record<string, RegistryDocument>;
  minimumReleaseAge: number;
  excluded: readonly string[];
  now: number;
  nodeLtsMajor: number;
};

type Channel = {
  describe: string;
  candidates: (document: RegistryDocument, context: Context) => string[];
};

type Found = Pick<Row, "newest" | "eligible" | "eligibleAt" | "channel">;

const minute = 60_000;
const aliasedPackage = /^npm:((?:@[^/@]+\/)?[^@]+)@(.+)$/;
const packageManagerPin = /^((?:@[^/@]+\/)?[^@]+)@(.+)$/;

export const packageManagerName = "packageManager";
export const nodeName = "engines.node";

function versionsIn(document: RegistryDocument): string[] {
  return Object.keys(document.time ?? {}).filter((version) => semver.valid(version) !== null);
}

function tagged(tag: string): Channel["candidates"] {
  return (document) => {
    const target = document["dist-tags"]?.[tag];
    if (!target) return [];
    const prerelease = semver.prerelease(target) !== null;
    return versionsIn(document).filter(
      (version) =>
        semver.major(version) === semver.major(target) &&
        (semver.prerelease(version) !== null) === prerelease &&
        semver.lte(version, target),
    );
  };
}

const latestChannel: Channel = { describe: "the latest tag", candidates: tagged("latest") };
const nodeChannel = "Node's newest LTS";

export const channels: Record<string, Channel> = {
  "solid-js": { describe: "the next tag", candidates: tagged("next") },
  "@solidjs/web": { describe: "the next tag", candidates: tagged("next") },
  "@solidjs/vite-plugin": { describe: "its newest prerelease", candidates: versionsIn },
  "@types/node": {
    describe: "the major of Node's newest LTS",
    candidates: (document, { nodeLtsMajor }) =>
      versionsIn(document).filter(
        (version) => semver.prerelease(version) === null && semver.major(version) === nodeLtsMajor,
      ),
  },
};

function lowestVersionOf(specifier: string | undefined): string | undefined {
  return specifier === undefined ? undefined : semver.minVersion(specifier)?.version;
}

/**
 * The versions this repository pins: every catalog entry, the package manager and the lowest Node
 * version `engines.node` accepts. A catalog entry written as an npm alias is checked as the package
 * it names.
 */
export function pinsOf(pinned: {
  catalog: Record<string, string>;
  packageManager: string;
  nodeRange: string;
}): Pin[] {
  const fromCatalog = Object.entries(pinned.catalog).map(([name, specifier]): Pin => {
    const alias = aliasedPackage.exec(specifier);
    return {
      name,
      registryName: alias ? alias[1] : name,
      pinned: lowestVersionOf(alias ? alias[2] : specifier),
    };
  });
  const [, manager, managerVersion] = packageManagerPin.exec(pinned.packageManager) ?? [];
  return [
    ...fromCatalog,
    { name: packageManagerName, registryName: manager, pinned: lowestVersionOf(managerVersion) },
    { name: nodeName, registryName: undefined, pinned: lowestVersionOf(pinned.nodeRange) },
  ];
}

function newestNodeLts(nodeReleases: readonly NodeRelease[]): string | undefined {
  return nodeReleases
    .filter(({ lts }) => lts !== false)
    .flatMap(({ version }) => semver.clean(version) ?? [])
    .sort(semver.rcompare)[0];
}

function nodeFound(nodeReleases: readonly NodeRelease[]): Found {
  const newest = newestNodeLts(nodeReleases);
  return { newest, eligible: newest, eligibleAt: undefined, channel: nodeChannel };
}

function packageFound(pin: Pin, context: Context): Found {
  const document = context.documents[pin.registryName ?? ""] ?? {};
  const channel = channels[pin.name] ?? latestChannel;
  const candidates = channel
    .candidates(document, context)
    .sort(semver.rcompare)
    .map((version) => {
      const eligibleAt =
        Date.parse(document.time?.[version] ?? "") + context.minimumReleaseAge * minute;
      const excluded =
        context.excluded.includes(pin.registryName ?? "") ||
        context.excluded.includes(`${pin.registryName}@${version}`);
      return { version, eligibleAt, eligible: excluded || eligibleAt <= context.now };
    });
  const [newest] = candidates;
  return {
    newest: newest?.version,
    eligible: candidates.find(({ eligible }) => eligible)?.version,
    eligibleAt: newest && !newest.eligible ? new Date(newest.eligibleAt).toISOString() : undefined,
    channel: channel.describe,
  };
}

function statusOf(pin: Pin, found: Found, held: HeldBack | undefined): Status {
  if (!found.newest || !pin.pinned) return "unknown";
  if (semver.lte(found.newest, pin.pinned)) return "current";
  if (found.eligible && semver.gt(found.eligible, pin.pinned)) return held ? "held back" : "behind";
  return "not yet eligible";
}

/**
 * Compares each pin with the newest release on its channel. A release younger than the minimum
 * release age, in minutes, is not yet eligible unless the exclusions name it, and an entry of the
 * held-back list keeps a pin that is behind from failing. The problems are what fails the check: a
 * pin behind its channel, a pin the registry gives no release for, and a held-back entry that holds
 * nothing back or gives no reason or no lifting condition.
 */
export function newestReleases(input: {
  pins: readonly Pin[];
  documents: Record<string, RegistryDocument>;
  nodeReleases: readonly NodeRelease[];
  minimumReleaseAge: number;
  excluded?: readonly string[];
  heldBack?: readonly HeldBack[];
  now: number;
}): { rows: Row[]; problems: string[] } {
  const heldBack = input.heldBack ?? [];
  const context: Context = {
    documents: input.documents,
    minimumReleaseAge: input.minimumReleaseAge,
    excluded: input.excluded ?? [],
    now: input.now,
    nodeLtsMajor: semver.major(newestNodeLts(input.nodeReleases) ?? "0.0.0"),
  };
  const rows = input.pins.map((pin): Row => {
    const held = heldBack.find(({ name }) => name === pin.name);
    const found =
      pin.name === nodeName ? nodeFound(input.nodeReleases) : packageFound(pin, context);
    return { ...pin, ...found, status: statusOf(pin, found, held), held };
  });
  const problems = [
    ...rows
      .filter(({ status }) => status === "behind")
      .map(
        ({ name, pinned, eligible, channel }) =>
          `${name}: ${pinned} is behind ${eligible}, the newest release on ${channel} that is old enough to install. Move to it, or hold it back with a reason and a lifting condition.`,
      ),
    ...rows
      .filter(({ status }) => status === "unknown")
      .map(
        ({ name, channel }) =>
          `${name}: the registry gave no release on ${channel} to compare with; check the name and the channel.`,
      ),
    ...heldBack
      .filter(({ name }) => !rows.some((row) => row.name === name && row.status === "held back"))
      .map(
        ({ name }) =>
          `${name}: the held-back list holds it, but it is not behind; remove the entry, since its lifting condition has come.`,
      ),
    ...heldBack
      .filter(({ reason, lift }) => !reason?.trim() || !lift?.trim())
      .map(({ name }) => `${name}: give the held-back entry a reason and a lifting condition.`),
  ];
  return { rows, problems };
}
