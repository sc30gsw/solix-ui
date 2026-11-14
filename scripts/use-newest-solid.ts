import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  newestEligibleRelease,
  type RegistryDocument,
  type ReleasePolicy,
} from "./newest-releases.ts";
import { registryDocument, releasePolicy } from "./release-sources.ts";

export const solidPackages = ["solid-js", "@solidjs/web"];
const workspaceFile = join(import.meta.dirname, "../pnpm-workspace.yaml");

export function newestSolidVersions(
  documents: Record<string, RegistryDocument>,
  policy: ReleasePolicy,
): Record<string, string> {
  return Object.fromEntries(
    solidPackages.map((name) => {
      const version = newestEligibleRelease(name, documents[name] ?? {}, policy);
      if (!version) {
        throw new Error(`${name} has no Solid 2 release on the next tag old enough to install.`);
      }
      return [name, version];
    }),
  );
}

export function withCatalogVersions(workspace: string, versions: Record<string, string>): string {
  return Object.entries(versions).reduce((text, [name, version]) => {
    const entry = new RegExp(`^(  "?${name.replace("/", "\\/")}"?: ).*$`, "m");
    if (!entry.test(text)) throw new Error(`${name} is not in the catalog`);
    return text.replace(entry, `$1${version}`);
  }, workspace);
}

if (import.meta.main) {
  const documents = Object.fromEntries(
    await Promise.all(solidPackages.map(async (name) => [name, await registryDocument(name)])),
  );
  const versions = newestSolidVersions(documents, releasePolicy());
  await writeFile(
    workspaceFile,
    withCatalogVersions(await readFile(workspaceFile, "utf8"), versions),
  );
  for (const [name, version] of Object.entries(versions)) console.log(`${name} -> ${version}`);
}
