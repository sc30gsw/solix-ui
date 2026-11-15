import semver from "semver";

export const heldBackFile = "scripts/held-back-releases.json";
export const packageManagerPinName = "packageManager";
export const nodePinName = "engines.node";

export type RegistryDocument = {
  versions?: Record<string, { peerDependencies?: Record<string, string> }>;
  time?: Record<string, string>;
};

export type NodeRelease = { version: string; lts: string | false };

export type Pin =
  | { source: "registry"; name: string; registryName: string; pinned: string }
  | { source: "node"; name: typeof nodePinName; pinned: string };

export type HeldBack = { name: string; reason: string; liftWhen: string };

export type ReleasePolicy = {
  minimumReleaseAgeMinutes: number;
  excluded: readonly string[];
  now: number;
};

type Compared = { pin: Pin; channel: string; newest: string };

export type PinComparison =
  | (Compared & { status: "current" })
  | (Compared & { status: "behind"; eligible: string })
  | (Compared & { status: "held back"; eligible: string; held: HeldBack })
  | (Compared & { status: "not yet eligible"; eligibleAt: string })
  | { pin: Pin; channel: string; status: "no release" };

export type Report = { comparisons: PinComparison[]; problems: string[] };

type Channel = {
  describe: string;
  versions: (published: string[], majors: { pinned: number; nodeLts: number }) => string[];
};

type Releases = { newest: string | undefined; eligible: string[] };

const minute = 60_000;
const solidMajor = 2;
const aliasedPackage = /^npm:((?:@[^/@]+\/)?[^@]+)@(.+)$/;
const packageAndVersion = /^((?:@[^/@]+\/)?[^@]+)@(.+)$/;
const packageName = /^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/;

const stableChannel: Channel = {
  describe: "its newest stable release",
  versions: (published) => published.filter((version) => semver.prerelease(version) === null),
};
function solidLine(published: string[]): string[] {
  const line = published.filter((version) => semver.major(version) === solidMajor);
  const stable = line.filter((version) => semver.prerelease(version) === null);
  return stable.length > 0 ? stable : line;
}

const solidChannel: Channel = {
  describe: `the newest Solid ${solidMajor} release, stable once a stable ${solidMajor}.x exists`,
  versions: solidLine,
};

export const channels: Record<string, Channel> = {
  "solid-js": solidChannel,
  "@solidjs/web": solidChannel,
  "@solidjs/vite-plugin": {
    describe: "its newest release on the major it pins, tagged or not",
    versions: (published, majors) =>
      published.filter((version) => semver.major(version) === majors.pinned),
  },
  "@types/node": {
    describe: "its newest stable release on the major of Node's newest LTS",
    versions: (published, majors) =>
      stableChannel
        .versions(published, majors)
        .filter((version) => semver.major(version) === majors.nodeLts),
  },
};
const nodeChannel = "Node's newest LTS";

export const solidPackages = Object.keys(channels).filter(
  (name) => channels[name] === solidChannel,
);

function channelOf(name: string): Channel {
  return channels[name] ?? stableChannel;
}

function publishedVersions(document: RegistryDocument): string[] {
  return Object.keys(document.versions ?? {}).filter((version) => semver.valid(version) !== null);
}

function lowestVersion(where: string, specifier: string | undefined): string {
  const version = specifier === undefined ? undefined : semver.minVersion(specifier)?.version;
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

export function isExcluded(
  registryName: string,
  version: string,
  excluded: readonly string[],
): boolean {
  return excluded.some((entry) => {
    const [, name, exact] = packageAndVersion.exec(entry) ?? [undefined, entry, undefined];
    if (!packageName.test(name ?? "") || (exact !== undefined && semver.valid(exact) === null)) {
      throw new Error(
        `minimumReleaseAgeExclude: "${entry}" is not a package name or <name>@<exact version>, the only entries this check reads.`,
      );
    }
    return name === registryName && (exact === undefined || exact === version);
  });
}

function eligibleAt(document: RegistryDocument, version: string, policy: ReleasePolicy): number {
  return Date.parse(document.time?.[version] ?? "") + policy.minimumReleaseAgeMinutes * minute;
}

function isEligible(
  registryName: string,
  document: RegistryDocument,
  version: string,
  policy: ReleasePolicy,
): boolean {
  return (
    isExcluded(registryName, version, policy.excluded) ||
    eligibleAt(document, version, policy) <= policy.now
  );
}

function releasesAmong(
  registryName: string,
  document: RegistryDocument,
  candidates: string[],
  policy: ReleasePolicy,
): Releases {
  const newestFirst = [...candidates].sort(semver.rcompare);
  return {
    newest: newestFirst[0],
    eligible: newestFirst.filter((version) => isEligible(registryName, document, version, policy)),
  };
}

export function solidReleases(
  name: string,
  document: RegistryDocument,
  policy: ReleasePolicy,
): Releases {
  return releasesAmong(name, document, solidLine(publishedVersions(document)), policy);
}

function newestNodeLts(nodeReleases: readonly NodeRelease[]): string | undefined {
  return nodeReleases
    .filter(({ lts }) => lts !== false)
    .flatMap(({ version }) => semver.clean(version) ?? [])
    .sort(semver.rcompare)[0];
}

function compared(
  pin: Pin,
  channel: string,
  newest: string | undefined,
  eligible: string | undefined,
  notYetEligibleAt: number | undefined,
  held: HeldBack | undefined,
): PinComparison {
  if (newest === undefined) return { pin, channel, status: "no release" };
  if (semver.lte(newest, pin.pinned)) return { pin, channel, newest, status: "current" };
  if (eligible !== undefined && semver.gt(eligible, pin.pinned)) {
    return held
      ? { pin, channel, newest, status: "held back", eligible, held }
      : { pin, channel, newest, status: "behind", eligible };
  }
  return {
    pin,
    channel,
    newest,
    status: "not yet eligible",
    eligibleAt: new Date(notYetEligibleAt ?? 0).toISOString(),
  };
}

export function heldBackProblems(
  heldBack: readonly HeldBack[],
  comparisons: readonly PinComparison[],
): string[] {
  return [
    ...heldBack
      .filter(
        ({ name }) =>
          !comparisons.some(({ pin, status }) => pin.name === name && status === "held back"),
      )
      .map(
        ({ name }) =>
          `${name}: the held-back list holds it, but it is not behind; remove the entry.`,
      ),
    ...heldBack
      .filter(({ reason, liftWhen }) => !reason?.trim() || !liftWhen?.trim())
      .map(({ name }) => `${name}: give the entry in ${heldBackFile} a reason and a liftWhen.`),
  ];
}

export function compareWithNewest(input: {
  pins: readonly Pin[];
  documents: Record<string, RegistryDocument>;
  nodeReleases: readonly NodeRelease[];
  policy: ReleasePolicy;
  heldBack: readonly HeldBack[];
}): Report {
  const nodeLts = newestNodeLts(input.nodeReleases);
  const nodeLtsMajor = semver.major(nodeLts ?? "0.0.0");
  const comparisons = input.pins.map((pin): PinComparison => {
    const held = input.heldBack.find(({ name }) => name === pin.name);
    if (pin.source === "node") return compared(pin, nodeChannel, nodeLts, nodeLts, undefined, held);
    const document = input.documents[pin.registryName] ?? {};
    const { newest, eligible } = releasesAmong(
      pin.registryName,
      document,
      channelOf(pin.registryName).versions(publishedVersions(document), {
        pinned: semver.major(pin.pinned),
        nodeLts: nodeLtsMajor,
      }),
      input.policy,
    );
    return compared(
      pin,
      channelOf(pin.registryName).describe,
      newest,
      eligible[0],
      newest === undefined ? undefined : eligibleAt(document, newest, input.policy),
      held,
    );
  });
  const problems = [
    ...comparisons.flatMap((comparison) =>
      comparison.status === "behind"
        ? [
            `${comparison.pin.name}: ${comparison.pin.pinned} is behind ${comparison.eligible}, ${comparison.channel} that is old enough to install. Move to it, or hold it back in ${heldBackFile} with a reason and a liftWhen.`,
          ]
        : comparison.status === "no release"
          ? [
              `${comparison.pin.name}: the registry lists no release for ${comparison.channel}; check the name and the channel.`,
            ]
          : [],
    ),
    ...heldBackProblems(input.heldBack, comparisons),
  ];
  return { comparisons, problems };
}

export function reportTable(comparisons: readonly PinComparison[]): string {
  const rows = comparisons.map((comparison) => {
    const newest = comparison.status === "no release" ? "?" : comparison.newest;
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

export function newestSolidRelease(
  documents: Record<string, RegistryDocument>,
  policy: ReleasePolicy,
): string {
  const eligibleSets = solidPackages.map(
    (name) => solidReleases(name, documents[name] ?? {}, policy).eligible,
  );
  const together = (eligibleSets[0] ?? []).filter((version) =>
    eligibleSets.every((eligible) => eligible.includes(version)),
  );
  const peersAgree = (version: string) =>
    solidPackages.every((name) =>
      Object.entries(documents[name]?.versions?.[version]?.peerDependencies ?? {})
        .filter(([peer]) => solidPackages.includes(peer))
        .every(([, range]) => semver.satisfies(version, range, { includePrerelease: true })),
    );
  const version = together.find(peersAgree);
  if (version === undefined) {
    throw new Error(
      `No release of ${solidPackages.join(" and ")} is ${solidChannel.describe}, published for each of them, old enough to install and accepted by their peer ranges.`,
    );
  }
  return version;
}

export function withCatalogVersions(
  workspace: string,
  catalog: Record<string, string>,
  versions: Record<string, string>,
): string {
  const lines = workspace.split("\n");
  for (const [name, version] of Object.entries(versions)) {
    const current = catalog[name];
    const written = [`  ${name}: ${current}`, `  "${name}": ${current}`];
    const matches = lines.flatMap((line, index) => (written.includes(line) ? [index] : []));
    if (current === undefined || matches.length !== 1) {
      throw new Error(`${name}: the catalog does not hold it as one line ${written[0]}.`);
    }
    lines[matches[0]] = lines[matches[0]].replace(`: ${current}`, `: ${version}`);
  }
  return lines.join("\n");
}
