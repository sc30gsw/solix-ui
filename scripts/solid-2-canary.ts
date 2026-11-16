import { newestSolidRelease, solidPackages } from "./newest-releases.ts";
import { pnpmSettings, rewriteCatalog } from "./pnpm-settings.ts";
import { registryDocuments, releasePolicy } from "./release-sources.ts";
import { listed } from "./repository.ts";

const version = newestSolidRelease(
  await registryDocuments(solidPackages),
  releasePolicy(pnpmSettings()),
  Date.now(),
);
rewriteCatalog(Object.fromEntries(solidPackages.map((name) => [name, version])));
console.log(`${listed(solidPackages)} -> ${version}`);
