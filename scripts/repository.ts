import { readFileSync } from "node:fs";
import { join } from "node:path";

export const repositoryRoot = join(import.meta.dirname, "..");
export const installedVp = join(repositoryRoot, "node_modules/.bin/vp");

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
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

export function manifestAt(path: string): Manifest {
  return JSON.parse(readFileSync(join(repositoryRoot, path), "utf8")) as Manifest;
}

export function rootManifest(): Manifest {
  return manifestAt("package.json");
}
