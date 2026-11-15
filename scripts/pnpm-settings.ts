import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export const workspaceFile = "pnpm-workspace.yaml";

export type PnpmSettings = {
  catalog: Record<string, string>;
  minimumReleaseAge: number | undefined;
  minimumReleaseAgeStrict: boolean;
  minimumReleaseAgeExclude: string[];
  approvedSkills: Record<string, string[]>;
};

type RawSettings = {
  catalog?: Record<string, string>;
  minimumReleaseAge?: number;
  minimumReleaseAgeStrict?: boolean;
  minimumReleaseAgeExclude?: string[] | null;
  permissions?: Record<string, { skills?: string[] | boolean }>;
};

const repositoryRoot = join(import.meta.dirname, "..");
const installedVp = join(repositoryRoot, "node_modules/.bin/vp");
let read: PnpmSettings | undefined;

function approvedSkillsIn(permissions: RawSettings["permissions"]): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(permissions ?? {}).map(([pack, { skills }]) => {
      if (skills === true) {
        throw new Error(
          `${workspaceFile}: name the skills of ${pack} you approve instead of skills: true.`,
        );
      }
      return [pack, Array.isArray(skills) ? skills : []];
    }),
  );
}

export function pnpmSettings(): PnpmSettings {
  if (read) return read;
  const raw = JSON.parse(
    execFileSync(existsSync(installedVp) ? installedVp : "vp", ["pm", "config", "list", "--json"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }),
  ) as RawSettings;
  if (!raw.catalog || Object.keys(raw.catalog).length === 0) {
    throw new Error(`${workspaceFile}: pnpm reports no catalog entries; check the catalog.`);
  }
  read = {
    catalog: raw.catalog,
    minimumReleaseAge: raw.minimumReleaseAge,
    minimumReleaseAgeStrict: raw.minimumReleaseAgeStrict ?? false,
    minimumReleaseAgeExclude: raw.minimumReleaseAgeExclude ?? [],
    approvedSkills: approvedSkillsIn(raw.permissions),
  };
  return read;
}
