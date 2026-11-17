import type {
  RegistryDocument,
  ReleasePolicy,
  VersionManifest,
} from "#/scripts/newest-releases.ts";

export const now = Date.parse("2026-11-14T12:00:00Z");
export const day = 24 * 60 * 60_000;
export const policy: ReleasePolicy = { minimumReleaseAgeMinutes: 24 * 60, exempted: [] };

export type Listing = [version: string, daysAgo: number, manifest?: VersionManifest];

export function registryDocument(
  listings: Listing[],
  unpublished: Listing[] = [],
): RegistryDocument {
  const at = ([version, daysAgo]: Listing) => [
    version,
    new Date(now - daysAgo * day).toISOString(),
  ];
  return {
    versions: Object.fromEntries(listings.map(([version, , manifest = {}]) => [version, manifest])),
    time: {
      created: "2020-01-01T00:00:00Z",
      ...Object.fromEntries([...listings, ...unpublished].map(at)),
    },
  };
}

export function solidLine(
  webPeer: (version: string) => string,
  listings: Listing[],
  compiler: (version: string) => VersionManifest = () => ({}),
) {
  return {
    "solid-js": registryDocument(listings),
    "@solidjs/web": registryDocument(
      listings.map(([version, daysAgo]) => [
        version,
        daysAgo,
        { peerDependencies: { "solid-js": webPeer(version) } },
      ]),
    ),
    "@solidjs/compiler": registryDocument(
      listings.map(([version, daysAgo]) => [version, daysAgo, compiler(version)]),
    ),
    "@solidjs/signals": registryDocument(listings),
  };
}
