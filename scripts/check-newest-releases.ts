import {
  compareWithNewest,
  pinsOf,
  registryNamesToFetch,
  reportTable,
} from "#/scripts/newest-releases.ts";
import { pnpmSettings } from "#/scripts/pnpm-settings.ts";
import {
  heldBackEntries,
  nodeReleases,
  registryDocuments,
  releasePolicy,
} from "#/scripts/release-sources.ts";
import { rootManifest } from "#/scripts/repository.ts";

const settings = pnpmSettings();
const pins = pinsOf(rootManifest(), settings.catalog);
const policy = releasePolicy(settings);
const { comparisons, problems } = compareWithNewest({
  pins,
  documents: await registryDocuments(registryNamesToFetch(pins, policy)),
  nodeReleases: await nodeReleases(),
  policy,
  now: Date.now(),
  heldBack: heldBackEntries(),
});

console.log(reportTable(comparisons));
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exitCode = 1;
}
