import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const solidPackages = ["solid-js", "@solidjs/web"];
const workspaceFile = join(import.meta.dirname, "../pnpm-workspace.yaml");

function precedence(version) {
  const [core, prerelease = ""] = version.split("-");
  const numbers = (text) => (text.match(/\d+/g) ?? []).map(Number);
  return { core: numbers(core), isStable: prerelease === "", prerelease: numbers(prerelease) };
}

function byPrecedence(left, right) {
  const [a, b] = [precedence(left), precedence(right)];
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] - b.core[index];
  }
  if (a.isStable !== b.isStable) return a.isStable ? 1 : -1;
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index += 1) {
    const difference = (a.prerelease[index] ?? -1) - (b.prerelease[index] ?? -1);
    if (difference !== 0) return difference;
  }
  return 0;
}

async function newestSolidTwoVersion(name) {
  const response = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}`);
  if (!response.ok) throw new Error(`npm registry answered ${response.status} for ${name}`);
  const tags = (await response.json())["dist-tags"];
  const newest = [tags.latest, tags.next]
    .filter((version) => version?.startsWith("2."))
    .sort(byPrecedence)
    .at(-1);
  if (!newest) throw new Error(`${name} has no Solid 2 release under latest or next`);
  return newest;
}

let workspace = await readFile(workspaceFile, "utf8");
for (const name of solidPackages) {
  const catalogEntry = new RegExp(`^(  "?${name.replace("/", "\\/")}"?: ).*$`, "m");
  if (!catalogEntry.test(workspace)) throw new Error(`${name} is not in the catalog`);
  const version = await newestSolidTwoVersion(name);
  workspace = workspace.replace(catalogEntry, `$1${version}`);
  console.log(`${name} -> ${version}`);
}
await writeFile(workspaceFile, workspace);
