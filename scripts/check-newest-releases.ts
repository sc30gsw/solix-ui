import {
  compareWithNewest,
  pinsOf,
  pullRequestAdvice,
  reportTable,
} from "#/scripts/newest-releases.ts";
import { pnpmSettings } from "#/scripts/pnpm-settings.ts";
import {
  heldBackEntries,
  nodeReleases,
  registryDocuments,
  releasePolicy,
  untilStableMembers,
} from "#/scripts/release-sources.ts";
import { rootManifest } from "#/scripts/repository.ts";

const settings = pnpmSettings();
const pins = pinsOf(rootManifest(), settings.catalog);
const { comparisons, problems } = compareWithNewest({
  pins,
  documents: await registryDocuments(
    pins.flatMap((pin) => (pin.source === "registry" ? [pin.registryName] : [])),
  ),
  nodeReleases: await nodeReleases(),
  policy: releasePolicy(settings),
  now: Date.now(),
  heldBack: heldBackEntries(),
  untilStablePackages: untilStableMembers(settings.catalog),
});

console.log(reportTable(comparisons));
if (problems.length > 0) {
  console.error(
    [
      ...problems,
      ...pullRequestAdvice({
        eventName: process.env.GITHUB_EVENT_NAME,
        baseRef: process.env.GITHUB_BASE_REF,
      }),
    ].join("\n"),
  );
  process.exitCode = 1;
}
