import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type HeldBack,
  type NodeRelease,
  newestReleases,
  pinsOf,
  type RegistryDocument,
  type Row,
} from "./newest-releases.ts";

const repositoryRoot = join(import.meta.dirname, "..");
const heldBackFile = "scripts/held-back-releases.json";
const registry = "https://registry.npmjs.org";
const nodeIndex = "https://nodejs.org/dist/index.json";

function pnpmSetting(name: string): unknown {
  const output = execFileSync("vp", ["pm", "config", "get", name, "--json"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
  return output === "" || output === "undefined" ? undefined : JSON.parse(output);
}

async function fetched(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

function described({ status, eligibleAt, held }: Row): string {
  if (status === "not yet eligible") return `not yet eligible, until ${eligibleAt}`;
  if (status === "held back" && held) return `held back: ${held.reason} Lift when ${held.lift}`;
  return status;
}

const manifest = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8")) as {
  packageManager?: string;
  engines?: { node?: string };
};
const minimumReleaseAge = pnpmSetting("minimumReleaseAge");
if (typeof minimumReleaseAge !== "number") {
  throw new Error(
    "pnpm-workspace.yaml: set minimumReleaseAge, so pnpm and this check read one release age.",
  );
}
const pins = pinsOf({
  catalog: (pnpmSetting("catalog") ?? {}) as Record<string, string>,
  packageManager: manifest.packageManager ?? "",
  nodeRange: manifest.engines?.node ?? "",
});
const names = [
  ...new Set(pins.flatMap(({ registryName }) => (registryName ? [registryName] : []))),
];
const documents = Object.fromEntries(
  await Promise.all(
    names.map(async (name) => [
      name,
      (await fetched(`${registry}/${name.replace("/", "%2f")}`)) as RegistryDocument,
    ]),
  ),
);
const { rows, problems } = newestReleases({
  pins,
  documents,
  nodeReleases: (await fetched(nodeIndex)) as NodeRelease[],
  minimumReleaseAge,
  excluded: (pnpmSetting("minimumReleaseAgeExclude") ?? []) as string[],
  heldBack: JSON.parse(readFileSync(join(repositoryRoot, heldBackFile), "utf8")) as HeldBack[],
  now: Date.now(),
});

console.log("| Pin | Pinned | Newest | Channel | Status |");
console.log("| --- | --- | --- | --- | --- |");
for (const row of rows) {
  console.log(
    `| ${row.name} | ${row.pinned} | ${row.newest ?? "?"} | ${row.channel} | ${described(row)} |`,
  );
}
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exitCode = 1;
}
