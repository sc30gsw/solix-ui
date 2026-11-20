import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  prereleasePinsOnlyNamedBy,
  type HeldBack,
  heldBackFile,
  type NodeRelease,
  type RegistryDocument,
  type ReleasePolicy,
} from "#/scripts/newest-releases.ts";
import { type PnpmSettings, workspaceFile } from "#/scripts/pnpm-settings.ts";
import { manifestAt, manifestPaths, repositoryRoot, unique } from "#/scripts/repository.ts";

const registry = "https://registry.npmjs.org";
const nodeIndex = "https://nodejs.org/dist/index.json";

export function releasePolicy(settings: PnpmSettings): ReleasePolicy {
  if (settings.minimumReleaseAge === undefined) {
    throw new Error(`${workspaceFile}: set minimumReleaseAge.`);
  }
  return { minimumReleaseAgeMinutes: settings.minimumReleaseAge };
}

export const storybookAppManifest = "apps/storybook/package.json";

export function untilStableMembers(catalog: Record<string, string>): string[] {
  return prereleasePinsOnlyNamedBy(
    manifestAt(storybookAppManifest),
    manifestPaths()
      .filter((path) => path !== storybookAppManifest)
      .map(manifestAt),
    catalog,
  );
}

export function heldBackEntries(): HeldBack[] {
  return JSON.parse(readFileSync(join(repositoryRoot, heldBackFile), "utf8"));
}

const fetchTimeoutMs = 30_000;

class SourceFailure extends Error {}

function whyItFailed(error: unknown, timeoutMs: number): string {
  if (error instanceof SourceFailure) return error.message;
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return `no answer within ${timeoutMs} ms`;
  }
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
  return cause === "" ? message : `${message} (${cause})`;
}

async function tried(url: string, timeoutMs: number): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new SourceFailure(`answered ${response.status}`);
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    throw new SourceFailure(`answered ${response.status} with a body that is not JSON`);
  }
}

export async function fetchedJson(url: string, timeoutMs = fetchTimeoutMs): Promise<unknown> {
  try {
    return await tried(url, timeoutMs);
  } catch {
    try {
      return await tried(url, timeoutMs);
    } catch (error) {
      throw new Error(
        `${url}: ${whyItFailed(error, timeoutMs)}, on the first try and on the retry.`,
        {
          cause: error,
        },
      );
    }
  }
}

export async function registryDocuments(
  names: readonly string[],
): Promise<Record<string, RegistryDocument>> {
  return Object.fromEntries(
    await Promise.all(
      unique(names).map(async (name) => [
        name,
        (await fetchedJson(`${registry}/${name.replace("/", "%2f")}`)) as RegistryDocument,
      ]),
    ),
  );
}

export async function nodeReleases(): Promise<NodeRelease[]> {
  return (await fetchedJson(nodeIndex)) as NodeRelease[];
}
