import {
  newestSolidRelease,
  solidBuildNames,
  solidPackages,
  staleSolidExemptions,
} from "#/scripts/newest-releases.ts";
import { pnpmSettings, rewriteCatalog } from "#/scripts/pnpm-settings.ts";
import { registryDocuments, releasePolicy } from "#/scripts/release-sources.ts";
import { listed } from "#/scripts/repository.ts";

const settings = pnpmSettings();
const policy = releasePolicy(settings);
const solid = await registryDocuments(solidPackages);
const documents = { ...solid, ...(await registryDocuments(solidBuildNames(solid))) };
const version = newestSolidRelease(documents, policy, Date.now());
const [first = ""] = solidPackages;
const stale = staleSolidExemptions(documents, policy, settings.catalog[first] ?? "", version);
if (stale.length > 0) throw new Error(stale.join("\n"));
rewriteCatalog(Object.fromEntries(solidPackages.map((name) => [name, version])));
console.log(`${listed(solidPackages)} -> ${version}`);
