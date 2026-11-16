import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type HeldBack,
  heldBackFile,
  type NodeRelease,
  type RegistryDocument,
  type ReleasePolicy,
} from "./newest-releases.ts";
import { type PnpmSettings, workspaceFile } from "./pnpm-settings.ts";
import { repositoryRoot } from "./repository.ts";

const registry = "https://registry.npmjs.org";
const nodeIndex = "https://nodejs.org/dist/index.json";

export function releasePolicy(settings: PnpmSettings): ReleasePolicy {
  if (settings.minimumReleaseAge === undefined) {
    throw new Error(`${workspaceFile}: set minimumReleaseAge.`);
  }
  return {
    minimumReleaseAgeMinutes: settings.minimumReleaseAge,
    excluded: settings.minimumReleaseAgeExclude,
    now: Date.now(),
  };
}

export function heldBackEntries(): HeldBack[] {
  return JSON.parse(readFileSync(join(repositoryRoot, heldBackFile), "utf8"));
}

async function fetched(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

export async function registryDocuments(
  names: readonly string[],
): Promise<Record<string, RegistryDocument>> {
  return Object.fromEntries(
    await Promise.all(
      [...new Set(names)].map(async (name) => [
        name,
        (await fetched(`${registry}/${name.replace("/", "%2f")}`)) as RegistryDocument,
      ]),
    ),
  );
}

export async function nodeReleases(): Promise<NodeRelease[]> {
  return (await fetched(nodeIndex)) as NodeRelease[];
}
