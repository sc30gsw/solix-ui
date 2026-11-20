import semver from "semver";

export const heldBackFile = "scripts/held-back-releases.json";
export const packageManagerPinName = "packageManager";
export const nodePinName = "engines.node";

export type VersionManifest = {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

export type RegistryDocument = {
  versions?: Record<string, VersionManifest>;
  time?: Record<string, string>;
  "dist-tags"?: Record<string, string>;
};

export type NodeRelease = { version: string; lts: string | false };

type RegistryPin = { source: "registry"; name: string; registryName: string; pinned: string };

export type Pin = RegistryPin | { source: "node"; name: typeof nodePinName; pinned: string };

export type HoldCondition = { pin: string; requiresExactly: { name: string; version: string } };

export type HeldBack = {
  name: string;
  reason: string;
  liftWhen: string;
  holds?: string;
  while?: HoldCondition;
};

const heldDirections = ["behind", "ahead"];

function directionOf(held: HeldBack): string {
  return held.holds ?? "behind";
}

export type Release = { name: string; version: string };

export type ReleasePolicy = { minimumReleaseAgeMinutes: number };

type Compared = { pin: Pin; channel: string; newest: string };

export type PinComparison =
  | (Compared & { status: "current" })
  | (Compared & { status: "behind"; eligible: string })
  | (Compared & { status: "held back"; eligible: string; held: HeldBack })
  | (Compared & { status: "held ahead"; held: HeldBack })
  | (Compared & { status: "not yet eligible"; eligibleAt: string })
  | (Compared & { status: "ahead" })
  | { pin: Pin; channel: string; status: "unknown"; why: string };

export type ProblemKind = "behind" | "ahead" | "unknown" | "hold";

export type Problem = { kind: ProblemKind; message: string };

export type Report = { comparisons: PinComparison[]; problems: Problem[] };

export type Published = { version: string; eligibleAt: number };

type Releases = {
  newest: string;
  eligible: string | undefined;
  eligibleAt: string | undefined;
};

type Unknown = { why: string };

type ChannelContext = {
  pinned: string;
  nodeLtsMajor: number | undefined;
  now: number;
  document: RegistryDocument | undefined;
};

type Channel = {
  describe: string;
  versions: (published: readonly Published[], context: ChannelContext) => Published[];
  unavailable?: (context: ChannelContext) => string | undefined;
};

const minute = 60_000;
export const solidMajor = 2;
const aliasedPackage = /^npm:((?:@[^/@]+\/)?[^@]+)@(.+)$/;
const packageAndVersion = /^((?:@[^/@]+\/)?[^@]+)@(.+)$/;
const nodeChannel = "Node's newest LTS";

export function isStable({ version }: Published): boolean {
  return semver.prerelease(version) === null;
}

export function isStableOnMajor(version: string, major: number | undefined): boolean {
  return semver.prerelease(version) === null && semver.major(version) === major;
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

function onTheMajorOf(published: readonly Published[], major: number | undefined): Published[] {
  return published.filter(({ version }) => semver.major(version) === major);
}

function stableOnMajor(published: readonly Published[], major: number | undefined): Published[] {
  return published.filter(({ version }) => isStableOnMajor(version, major));
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

function pinnedMajorUntilStable(
  published: readonly Published[],
  { pinned, now }: ChannelContext,
): Published[] {
  const line = onTheMajorOf(published, semver.major(pinned));
  return line.some((release) => isStable(release) && release.eligibleAt <= now)
    ? published.filter(isStable)
    : line;
}

const pinnedMajorUntilStableChannel: Channel = {
  describe:
    "its newest release on the major it pins, nightly, beta, release candidate or stable, until a stable release of that major is old enough to install; then its newest stable release",
  versions: pinnedMajorUntilStable,
};

const latestTagChannel: Channel = {
  describe: "the release its registry document's latest dist-tag names",
  versions: (published, { document }) =>
    published.filter(({ version }) => version === document?.["dist-tags"]?.latest),
  unavailable: ({ document }) =>
    document?.["dist-tags"]?.latest === undefined
      ? "its registry document has no latest dist-tag."
      : undefined,
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
  "@ui-sdk/core": latestTagChannel,
  "@ui-sdk/solid": latestTagChannel,
  "@types/node": {
    describe: "its newest stable release on the major of Node's newest LTS",
    versions: (published, { nodeLtsMajor }) => stableOnMajor(published, nodeLtsMajor),
  },
};

export const solidPackages = Object.keys(channels).filter(
  (name) => channels[name] === solidChannel,
);

function channelOf(
  { name, registryName, pinned }: RegistryPin,
  untilStablePackages: readonly string[],
): Channel {
  return (
    channels[registryName] ??
    (untilStablePackages.includes(name) ? pinnedMajorUntilStableChannel : undefined) ??
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
    const [, registryName = name, version = specifier] = aliasedPackage.exec(specifier) ?? [];
    return {
      source: "registry",
      name,
      registryName,
      pinned: lowestVersion(`catalog entry ${name}`, version),
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

type DependencyLists = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function namedBy(manifest: DependencyLists): string[] {
  return Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
}

export function prereleasePinsOnlyNamedBy(
  manifest: DependencyLists,
  others: readonly DependencyLists[],
  catalog: Record<string, string>,
): string[] {
  return namedBy(manifest)
    .filter((name) => {
      const specifier = catalog[name];
      const version = specifier === undefined ? null : semver.valid(specifier);
      return (
        version !== null &&
        semver.prerelease(version) !== null &&
        !others.some((other) => namedBy(other).includes(name))
      );
    })
    .sort();
}

export function exactlyRequiredBy(manifest: VersionManifest | undefined): Release[] {
  return Object.entries({ ...manifest?.dependencies, ...manifest?.optionalDependencies })
    .filter(([, specifier]) => semver.valid(specifier) === specifier)
    .map(([name, version]) => ({ name, version }));
}

function publishedAt(document: RegistryDocument, version: string): number | undefined {
  const time = document.time?.[version];
  const at = time === undefined ? Number.NaN : Date.parse(time);
  return Number.isNaN(at) ? undefined : at;
}

export function publishedIn(
  registryName: string,
  document: RegistryDocument | undefined,
  policy: ReleasePolicy,
): Published[] | Unknown {
  if (document === undefined) {
    return { why: `the registry answer holds no document for ${registryName}.` };
  }
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
    published.push({ version, eligibleAt: at + policy.minimumReleaseAgeMinutes * minute });
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
  channel: Channel,
  policy: ReleasePolicy,
  context: ChannelContext,
): Releases | Unknown {
  const published = publishedIn(pin.registryName, context.document, policy);
  if (!Array.isArray(published)) return published;
  const unavailable = channel.unavailable?.(context);
  if (unavailable !== undefined) return { why: unavailable };
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
  if (semver.gt(pin.pinned, newest)) {
    return held && directionOf(held) === "ahead"
      ? { pin, channel, newest, status: "held ahead", held }
      : { pin, channel, newest, status: "ahead" };
  }
  if (eligible !== undefined && semver.gt(eligible, pin.pinned)) {
    return held && directionOf(held) === "behind"
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
  return heldBack.flatMap((held, index) => {
    if (heldBack.findIndex(({ name }) => name === held.name) !== index) {
      return [`${held.name}: the held-back list names it more than once; keep one entry.`];
    }
    const status = comparisons.find(({ pin }) => pin.name === held.name)?.status;
    if (status === "held back" || status === "held ahead") return [];
    const now = status === "behind" || status === "ahead" ? status : undefined;
    return [
      now === undefined
        ? `${held.name}: the held-back list holds it, but it is neither behind nor ahead of its channel; remove the entry.`
        : `${held.name}: the held-back list holds it ${directionOf(held) === "ahead" ? "ahead of" : "behind"} its channel, but it is ${now}; remove the entry, or rewrite it to hold the pin ${now} with a reason and a liftWhen for that.`,
    ];
  });
}

export function holdsWithoutReason(heldBack: readonly HeldBack[]): string[] {
  return heldBack
    .filter(
      (held) =>
        !held.reason?.trim() ||
        !held.liftWhen?.trim() ||
        !heldDirections.includes(directionOf(held)),
    )
    .map(
      ({ name }) =>
        `${name}: give the entry in ${heldBackFile} a reason, a liftWhen and, for a pin ahead of its channel, holds: "ahead".`,
    );
}

export function holdsWhoseConditionFailed(
  heldBack: readonly HeldBack[],
  pins: readonly Pin[],
  documents: Record<string, RegistryDocument>,
): string[] {
  return heldBack.flatMap((held) => {
    const condition = held.while;
    if (condition === undefined) return [];
    const pin = pins.find(
      (candidate): candidate is RegistryPin =>
        candidate.source === "registry" && candidate.name === condition.pin,
    );
    if (pin === undefined) {
      return [
        `${held.name}: its hold names ${condition.pin}, which is not a pin of the catalog; name a registry pin.`,
      ];
    }
    const { name, version } = condition.requiresExactly;
    const required = exactlyRequiredBy(documents[pin.registryName]?.versions?.[pin.pinned]);
    return required.some((release) => release.name === name && release.version === version)
      ? []
      : [
          `${held.name}: it is held back while ${pin.name} ${pin.pinned} requires ${name} ${version} exactly, and ${pin.name} ${pin.pinned} no longer does; move ${held.name} and drop or rewrite its entry in ${heldBackFile}.`,
        ];
  });
}

export function compareWithNewest(input: {
  pins: readonly Pin[];
  documents: Record<string, RegistryDocument>;
  nodeReleases: readonly NodeRelease[];
  policy: ReleasePolicy;
  now: number;
  heldBack: readonly HeldBack[];
  untilStablePackages: readonly string[];
}): Report {
  const nodeLts = nodeLtsReleases(input.nodeReleases);
  const nodeLtsMajor = nodeLts && semver.major(nodeLts.newest);
  const comparisons = input.pins.map((pin): PinComparison => {
    const channel = pin.source === "node" ? undefined : channelOf(pin, input.untilStablePackages);
    const releases =
      channel === undefined || pin.source === "node"
        ? (nodeLts ?? { why: "Node's release index lists no LTS release." })
        : registryReleases(pin, channel, input.policy, {
            pinned: pin.pinned,
            nodeLtsMajor,
            now: input.now,
            document: input.documents[pin.registryName],
          });
    const described = channel === undefined ? nodeChannel : channel.describe;
    return "why" in releases
      ? { pin, channel: described, status: "unknown", why: releases.why }
      : compared(
          pin,
          described,
          releases,
          input.heldBack.find(({ name }) => name === pin.name),
        );
  });
  const holdProblems = [
    ...holdsOfNothing(input.heldBack, comparisons),
    ...holdsWithoutReason(input.heldBack),
    ...holdsWhoseConditionFailed(input.heldBack, input.pins, input.documents),
  ];
  const problems: Problem[] = [
    ...comparisons.flatMap((comparison): Problem[] => {
      if (comparison.status === "ahead") {
        return [
          {
            kind: "ahead",
            message: `${comparison.pin.name}: ${comparison.pin.pinned} is ahead of ${comparison.newest}, the newest release on its channel (${comparison.channel}). Pin ${comparison.newest}.`,
          },
        ];
      }
      if (comparison.status === "behind") {
        return [
          {
            kind: "behind",
            message: `${comparison.pin.name}: ${comparison.pin.pinned} is behind ${comparison.eligible}, the newest release it may move to (${comparison.channel}). Move to it, or hold it back in ${heldBackFile} with a reason and a liftWhen.`,
          },
        ];
      }
      return comparison.status === "unknown"
        ? [{ kind: "unknown", message: `${comparison.pin.name}: ${comparison.why}` }]
        : [];
    }),
    ...holdProblems.map((message): Problem => ({ kind: "hold", message })),
  ];
  return { comparisons, problems };
}

export type RunEnvironment = Record<string, string | undefined>;

export function failureLines(problems: readonly Problem[], run: RunEnvironment): string[] {
  const messages = problems.map(({ message }) => message);
  if (run.GITHUB_EVENT_NAME !== "pull_request" || !problems.some(({ kind }) => kind === "behind")) {
    return messages;
  }
  const base = run.GITHUB_BASE_REF || "main";
  return [
    ...messages,
    `On a pull request the check reads the registry as it is now, so a pin it names as behind is behind on ${base} too, unless this pull request moved it.`,
    `Move it in a build(deps) pull request of its own to ${base}, or hold it back there with a reason, then merge ${base} into this branch.`,
  ];
}

const keysOfAHold = ["name", "reason", "liftWhen", "holds", "while"];
const keysOfACondition = ["pin", "requiresExactly"];
const keysOfARequiredRelease = ["name", "version"];

function keysBeyond(part: unknown, allowed: readonly string[]): string[] {
  return isRecord(part) ? Object.keys(part).filter((key) => !allowed.includes(key)) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function holdShapeProblems(entry: unknown): string[] {
  if (!isRecord(entry)) return ["give it as an object."];
  const beyond = keysBeyond(entry, keysOfAHold);
  const condition = entry.while;
  const required = isRecord(condition) ? condition.requiresExactly : undefined;
  const conditionBeyond = keysBeyond(condition, keysOfACondition);
  const requiredBeyond = keysBeyond(required, keysOfARequiredRelease);
  return [
    ...(beyond.length > 0
      ? [
          `it sets ${beyond.join(", ")}; an entry sets only name, reason, liftWhen, holds and while.`,
        ]
      : []),
    ...(conditionBeyond.length > 0
      ? [`while sets ${conditionBeyond.join(", ")}; it sets only pin and requiresExactly.`]
      : []),
    ...(requiredBeyond.length > 0
      ? [`while.requiresExactly sets ${requiredBeyond.join(", ")}; it sets only name and version.`]
      : []),
    ...(["name", "reason", "liftWhen"].every((key) => typeof entry[key] === "string")
      ? []
      : ["give it a name, a reason and a liftWhen, each a string."]),
    ...(entry.holds === undefined ||
    (typeof entry.holds === "string" && heldDirections.includes(entry.holds))
      ? []
      : ['holds is "behind" or "ahead".']),
    ...(condition === undefined ||
    (isRecord(condition) &&
      typeof condition.pin === "string" &&
      isRecord(required) &&
      typeof required.name === "string" &&
      typeof required.version === "string")
      ? []
      : ["give while a pin and a requiresExactly with a name and a version."]),
  ];
}

export function heldBackFrom(value: unknown): HeldBack[] {
  if (!Array.isArray(value)) throw new Error(`${heldBackFile}: give a list of entries.`);
  const problems = value.flatMap((entry: unknown, index) => {
    const name = isRecord(entry) && typeof entry.name === "string" ? entry.name : "no name";
    return holdShapeProblems(entry).map(
      (problem) => `${heldBackFile}: entry ${index + 1} (${name}): ${problem}`,
    );
  });
  if (problems.length > 0) throw new Error(problems.join("\n"));
  return value as HeldBack[];
}

export function reportTable(comparisons: readonly PinComparison[]): string {
  const rows = comparisons.map((comparison) => {
    const newest = comparison.status === "unknown" ? "?" : comparison.newest;
    const status =
      comparison.status === "not yet eligible"
        ? `not yet eligible, until ${comparison.eligibleAt}`
        : comparison.status === "held back" || comparison.status === "held ahead"
          ? `${comparison.status}: ${comparison.held.reason} Lift when ${comparison.held.liftWhen}`
          : comparison.status;
    return `| ${comparison.pin.name} | ${comparison.pin.pinned} | ${newest} | ${comparison.channel} | ${status} |`;
  });
  return [
    "| Pin | Pinned | Newest | Channel | Status |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}
