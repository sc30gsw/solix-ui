import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  installedVp,
  listed,
  packageManagerAnswerTimeout,
  repositoryRoot,
} from "#/scripts/repository.ts";

export const workspaceFile = "pnpm-workspace.yaml";

export type PnpmSettings = {
  catalog: Record<string, string>;
  overrides: Record<string, string>;
  minimumReleaseAge: number | undefined;
  minimumReleaseAgeStrict: boolean;
  trustLockfile: boolean;
  ignorePnpmfile: boolean;
  minimumReleaseAgeExclude: string[];
  approvedSkills: Record<string, string[]>;
};

export type RawSettings = {
  catalog?: Record<string, string>;
  overrides?: Record<string, string>;
  minimumReleaseAge?: number;
  minimumReleaseAgeStrict?: boolean;
  trustLockfile?: boolean;
  ignorePnpmfile?: boolean;
  minimumReleaseAgeExclude?: string[] | null;
  permissions?: Record<string, { skills?: string[] | boolean }>;
};

const settingFromTheEnvironment = /^p?npm_config_/i;
let cached: PnpmSettings | undefined;

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

export function settingsFrom(raw: RawSettings): PnpmSettings {
  if (!raw.catalog || Object.keys(raw.catalog).length === 0) {
    throw new Error(`${workspaceFile}: pnpm reports no catalog entries; check the catalog.`);
  }
  return {
    catalog: raw.catalog,
    overrides: raw.overrides ?? {},
    minimumReleaseAge: raw.minimumReleaseAge,
    minimumReleaseAgeStrict: raw.minimumReleaseAgeStrict ?? false,
    trustLockfile: raw.trustLockfile ?? false,
    ignorePnpmfile: raw.ignorePnpmfile ?? false,
    minimumReleaseAgeExclude: raw.minimumReleaseAgeExclude ?? [],
    approvedSkills: approvedSkillsIn(raw.permissions),
  };
}

function withoutSettings(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(environment).filter(([name]) => !settingFromTheEnvironment.test(name)),
  );
}

function pnpmAnswer(directory: string, vp: string): string {
  const noUserConfig = mkdtempSync(join(tmpdir(), "no-pnpm-user-config-"));
  try {
    return execFileSync(vp, ["pm", "config", "list", "--json"], {
      cwd: directory,
      encoding: "utf8",
      env: { ...withoutSettings(process.env), XDG_CONFIG_HOME: noUserConfig },
      timeout: packageManagerAnswerTimeout,
    });
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException;
    if (code === "ENOENT") {
      throw new Error(
        `${workspaceFile} is read through pnpm, which ${vp} starts, and that is neither installed here nor on PATH. Install Vite+, then run \`vp install\`.`,
        { cause: error },
      );
    }
    if (code === "ETIMEDOUT") {
      throw new Error(
        `${vp} pm config list gave no answer in ${packageManagerAnswerTimeout / 1000} seconds.`,
        { cause: error },
      );
    }
    throw error;
  } finally {
    rmSync(noUserConfig, { recursive: true });
  }
}

export function readPnpmSettings(
  directory: string = repositoryRoot,
  vp: string = existsSync(installedVp) ? installedVp : "vp",
): PnpmSettings {
  return settingsFrom(JSON.parse(pnpmAnswer(directory, vp)) as RawSettings);
}

export function pnpmSettings(): PnpmSettings {
  cached ??= readPnpmSettings();
  return cached;
}

function withCatalogVersions(
  workspace: string,
  catalog: Record<string, string>,
  versions: Record<string, string>,
): string {
  const lines = workspace.split("\n");
  for (const [name, version] of Object.entries(versions)) {
    const current = catalog[name];
    const written = [`  ${name}: ${current}`, `  "${name}": ${current}`];
    const matches = lines.flatMap((line, index) => (written.includes(line) ? [index] : []));
    if (current === undefined || matches.length !== 1) {
      throw new Error(`${name}: the catalog does not hold it as one line ${written[0]}.`);
    }
    lines[matches[0]] = lines[matches[0]].replace(`: ${current}`, `: ${version}`);
  }
  return lines.join("\n");
}

export function rewriteCatalog(
  versions: Record<string, string>,
  directory: string = repositoryRoot,
): void {
  const path = join(directory, workspaceFile);
  const before = readPnpmSettings(directory).catalog;
  const original = readFileSync(path, "utf8");
  let pnpmReportsTheChange = false;
  writeFileSync(path, withCatalogVersions(original, before, versions));
  cached = undefined;
  try {
    pnpmReportsTheChange = isDeepStrictEqual(readPnpmSettings(directory).catalog, {
      ...before,
      ...versions,
    });
  } finally {
    if (!pnpmReportsTheChange) writeFileSync(path, original);
  }
  if (!pnpmReportsTheChange) {
    throw new Error(
      `${workspaceFile}: after the edit pnpm does not report exactly ${listed(Object.keys(versions))} changed; it was undone.`,
    );
  }
}
