import { readFileSync } from "node:fs";
import { join } from "node:path";

export const repositoryRoot = join(import.meta.dirname, "..");

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

export function manifestAt(path: string): Manifest {
  return JSON.parse(readFileSync(join(repositoryRoot, path), "utf8")) as Manifest;
}

export function rootManifest(): Manifest {
  return manifestAt("package.json");
}
