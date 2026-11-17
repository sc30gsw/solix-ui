import { solidPackages } from "#/scripts/newest-releases.ts";
import { pnpmSettings, rewriteCatalog } from "#/scripts/pnpm-settings.ts";
import { registryDocuments, releasePolicy } from "#/scripts/release-sources.ts";
import { solidBuildNames, solidCatalogMove } from "#/scripts/solid-2-release.ts";

const solid = await registryDocuments(solidPackages);
const documents = { ...solid, ...(await registryDocuments(solidBuildNames(solid))) };
const move = solidCatalogMove(documents, releasePolicy(pnpmSettings()), Date.now());
rewriteCatalog(move.versions);
console.log(move.summary);
