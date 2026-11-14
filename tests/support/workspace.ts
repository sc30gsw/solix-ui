import { type Dirent, globSync, readFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";

export const repositoryRoot = join(import.meta.dirname, "../..");
export const primitivesDirectory = join(repositoryRoot, "packages/primitives");

export const workspaceFile = "pnpm-workspace.yaml";

const generatedOrInstalled = new Set(["node_modules", "dist", ".git"]);
const catalogBlock = /^catalog:\n((?:[ \t]+.*\n?)+)/m;
const catalogEntry = /^\s+("?)([^":\s]+)\1:\s*"?([^"\s]+)"?\s*$/;
const permissionsBlock = /^permissions:\n((?:[ \t]+.*\n?)+)/m;
const permissionPackage = /^ {2}("?)([^":\s]+)\1:$/;
const permissionSkills = /^ {4}skills:(?: (true|false))?$/;
const permissionSkill = /^ {6}- (\S+)$/;
const peerDependencyThatMarksALibrary = "solid-js";

export type Manifest = {
  name?: string;
  license?: string;
  engines?: Record<string, string>;
  packageManager?: string;
  devEngines?: Record<string, unknown>;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

export function outsideGeneratedOrInstalled(entry: string | Dirent): boolean {
  return (typeof entry === "string" ? entry : entry.name)
    .split(sep)
    .some((segment) => generatedOrInstalled.has(segment));
}

export const packages = globSync("**/package.json", {
  cwd: repositoryRoot,
  exclude: outsideGeneratedOrInstalled,
}).map((path) => ({
  path,
  directory: join(repositoryRoot, dirname(path)),
  manifest: JSON.parse(readFileSync(join(repositoryRoot, path), "utf8")) as Manifest,
}));

export const rootManifest = JSON.parse(
  readFileSync(join(repositoryRoot, "package.json"), "utf8"),
) as Manifest;

export const libraryPackages = packages.filter(
  ({ manifest }) => peerDependencyThatMarksALibrary in (manifest.peerDependencies ?? {}),
);

function thePrimitivesPackage(): (typeof libraryPackages)[number] {
  const found = libraryPackages.find(({ directory }) => directory === primitivesDirectory);
  if (!found?.manifest.name) {
    throw new Error(`${primitivesDirectory}: no library package with a name was found there.`);
  }
  return found;
}

export const primitivesPackage = thePrimitivesPackage();

export const componentLibraries = libraryPackages.filter(
  ({ directory }) => directory !== primitivesDirectory,
);

export const libraryNames = libraryPackages.flatMap(({ manifest }) =>
  manifest.name === undefined ? [] : [manifest.name],
);

export const scriptFiles = globSync("**/*.{ts,tsx,mjs,cjs,js}", {
  cwd: repositoryRoot,
  exclude: outsideGeneratedOrInstalled,
});

export const workflowFiles = globSync(".github/workflows/*.{yml,yaml}", { cwd: repositoryRoot });

export function catalogVersions(): Record<string, string> {
  const block = catalogBlock.exec(readFileSync(join(repositoryRoot, workspaceFile), "utf8"))?.[1];
  const entries = (block ?? "")
    .split("\n")
    .map((line) => catalogEntry.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map(([, , name, version]): [string, string] => [name, version]);
  if (entries.length === 0) throw new Error(`${workspaceFile}: no catalog entries were found.`);
  return Object.fromEntries(entries);
}

export type SkillApproval = string[] | boolean;

export function skillApprovals(): Record<string, SkillApproval> {
  const block = permissionsBlock.exec(
    readFileSync(join(repositoryRoot, workspaceFile), "utf8"),
  )?.[1];
  const approvals: Record<string, SkillApproval> = {};
  let current: string | undefined;
  for (const line of (block ?? "").split("\n").filter((found) => found.trim() !== "")) {
    const named = permissionPackage.exec(line);
    const skills = permissionSkills.exec(line);
    const skill = permissionSkill.exec(line);
    const list = current === undefined ? undefined : approvals[current];
    if (named) {
      current = named[2];
    } else if (skills && current !== undefined) {
      approvals[current] = skills[1] === undefined ? [] : skills[1] === "true";
    } else if (skill && Array.isArray(list)) {
      list.push(skill[1]);
    } else {
      throw new Error(
        `${workspaceFile}: "${line.trim()}" is not a skill approval. Write each as permissions: <package>: skills: followed by the skill names, or skills: false.`,
      );
    }
  }
  return approvals;
}
