import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type HeldBack, newestReleases, pinsOf, type Row } from "./newest-releases.ts";
import { nodeReleases, pnpmSetting, registryDocument, releasePolicy } from "./release-sources.ts";

const repositoryRoot = join(import.meta.dirname, "..");
const heldBackFile = "scripts/held-back-releases.json";

function described({ status, eligibleAt, held }: Row): string {
  if (status === "not yet eligible") return `not yet eligible, until ${eligibleAt}`;
  if (status === "held back" && held) return `held back: ${held.reason} Lift when ${held.lift}`;
  return status;
}

const manifest = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8")) as {
  packageManager?: string;
  engines?: { node?: string };
};
const pins = pinsOf({
  catalog: (pnpmSetting("catalog") ?? {}) as Record<string, string>,
  packageManager: manifest.packageManager ?? "",
  nodeRange: manifest.engines?.node ?? "",
});
const names = [
  ...new Set(pins.flatMap(({ registryName }) => (registryName ? [registryName] : []))),
];
const documents = Object.fromEntries(
  await Promise.all(names.map(async (name) => [name, await registryDocument(name)])),
);
const { rows, problems } = newestReleases({
  pins,
  documents,
  nodeReleases: await nodeReleases(),
  ...releasePolicy(),
  heldBack: JSON.parse(readFileSync(join(repositoryRoot, heldBackFile), "utf8")) as HeldBack[],
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
