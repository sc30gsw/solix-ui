import { compareWithNewest, failureLines, pinsOf, reportTable } from "#/scripts/newest-releases.ts";
import { pnpmSettings } from "#/scripts/pnpm-settings.ts";
import {
  heldBackEntries,
  releasePolicy,
  releaseSources,
  untilStableMembers,
} from "#/scripts/release-sources.ts";
import { rootManifest } from "#/scripts/repository.ts";

const settings = pnpmSettings();
const pins = pinsOf(rootManifest(), settings.catalog);
const { comparisons, problems } = compareWithNewest({
  pins,
  ...(await releaseSources(
    pins.flatMap((pin) => (pin.source === "registry" ? [pin.registryName] : [])),
  )),
  policy: releasePolicy(settings),
  now: Date.now(),
  heldBack: heldBackEntries(),
  untilStablePackages: untilStableMembers(settings.catalog),
});

console.log(reportTable(comparisons));
if (problems.length > 0) {
  console.error(failureLines(problems, process.env).join("\n"));
  process.exitCode = 1;
}
