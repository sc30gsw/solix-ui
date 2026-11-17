import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const repositoryRoot = join(import.meta.dirname, "..");
export const installedVp = join(repositoryRoot, "node_modules/.bin/vp");
export const packageManagerAnswerTimeout = 30_000;

export type Installed = { name: string; version: string };

export type ExportTarget = string | null | ExportTarget[] | { [condition: string]: ExportTarget };

export type Manifest = {
  name?: string;
  license?: string;
  exports?: ExportTarget;
  engines?: Record<string, string>;
  packageManager?: string;
  devEngines?: Record<string, unknown>;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  bundledDependencies?: string[] | boolean;
  bundleDependencies?: string[] | boolean;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

export function manifestAt(path: string): Manifest {
  return JSON.parse(readFileSync(join(repositoryRoot, path), "utf8")) as Manifest;
}

export function rootManifest(): Manifest {
  return manifestAt("package.json");
}

export function listed(names: readonly string[]): string {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export function installedVersions(
  names: readonly string[],
  directory: string = repositoryRoot,
): Installed[] {
  const answer = execFileSync(installedVp, ["why", ...names, "-r", "--json"], {
    cwd: directory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: packageManagerAnswerTimeout,
  });
  const installed: unknown = JSON.parse(answer);
  if (!Array.isArray(installed)) throw new Error(`The package manager answered: ${answer}`);
  return installed.map(({ name, version }: Installed) => ({ name, version }));
}
