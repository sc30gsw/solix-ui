import { execFileSync } from "node:child_process";
import { join } from "node:path";
import type { NodeRelease, RegistryDocument, ReleasePolicy } from "./newest-releases.ts";

const repositoryRoot = join(import.meta.dirname, "..");
const registry = "https://registry.npmjs.org";
const nodeIndex = "https://nodejs.org/dist/index.json";

export function pnpmSetting(name: string): unknown {
  const output = execFileSync("vp", ["pm", "config", "get", name, "--json"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
  return output === "" || output === "undefined" ? undefined : JSON.parse(output);
}

export function releasePolicy(): ReleasePolicy {
  const minimumReleaseAgeMinutes = pnpmSetting("minimumReleaseAge");
  if (typeof minimumReleaseAgeMinutes !== "number") {
    throw new Error(
      "pnpm-workspace.yaml: set minimumReleaseAge, so pnpm and the release checks read one release age.",
    );
  }
  return {
    minimumReleaseAgeMinutes,
    excluded: (pnpmSetting("minimumReleaseAgeExclude") ?? []) as string[],
    now: Date.now(),
  };
}

async function fetched(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

export async function registryDocument(name: string): Promise<RegistryDocument> {
  return (await fetched(`${registry}/${name.replace("/", "%2f")}`)) as RegistryDocument;
}

export async function nodeReleases(): Promise<NodeRelease[]> {
  return (await fetched(nodeIndex)) as NodeRelease[];
}
