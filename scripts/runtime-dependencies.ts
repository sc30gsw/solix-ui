import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repositoryRoot } from "./repository.ts";

export const runtimeDependencyList = "scripts/runtime-dependencies.json";

export type AllowedRuntimeDependency = {
  library: string;
  dependency: string;
  seam: string;
  reason: string;
};

export function allowedRuntimeDependencies(): AllowedRuntimeDependency[] {
  return JSON.parse(
    readFileSync(join(repositoryRoot, runtimeDependencyList), "utf8"),
  ) as AllowedRuntimeDependency[];
}

export function allowedRuntimeDependencyNames(): string[] {
  return [...new Set(allowedRuntimeDependencies().map(({ dependency }) => dependency))];
}

export function loads(dependency: string, specifier: string): boolean {
  return specifier === dependency || specifier.startsWith(`${dependency}/`);
}
