import { newestSolidRelease, solidPackages } from "./newest-releases.ts";
import { pnpmSettings, rewriteCatalog } from "./pnpm-settings.ts";
import { registryDocuments, releasePolicy } from "./release-sources.ts";

const version = newestSolidRelease(
  await registryDocuments(solidPackages),
  releasePolicy(pnpmSettings()),
);
rewriteCatalog(Object.fromEntries(solidPackages.map((name) => [name, version])));
console.log(`${solidPackages.join(" and ")} -> ${version}`);
