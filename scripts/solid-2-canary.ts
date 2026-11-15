import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { newestSolidRelease, solidPackages, withCatalogVersions } from "./newest-releases.ts";
import { readPnpmSettings, workspaceFile } from "./pnpm-settings.ts";
import { registryDocuments, releasePolicy } from "./release-sources.ts";

const path = join(import.meta.dirname, "..", workspaceFile);
const before = readPnpmSettings();
const version = newestSolidRelease(await registryDocuments(solidPackages), releasePolicy(before));
const versions = Object.fromEntries(solidPackages.map((name) => [name, version]));
const original = readFileSync(path, "utf8");
writeFileSync(path, withCatalogVersions(original, before.catalog, versions));
if (!isDeepStrictEqual(readPnpmSettings().catalog, { ...before.catalog, ...versions })) {
  writeFileSync(path, original);
  throw new Error(`${workspaceFile}: the edit changed more than the Solid entries; it was undone.`);
}
console.log(`${solidPackages.join(" and ")} -> ${version}`);
