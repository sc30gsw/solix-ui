import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { askPackageManager, VitePlusNotFound } from "#/scripts/package-manager.ts";
import { listed, packageManagerAnswerTimeout, repositoryRoot } from "#/scripts/repository.ts";

export const workspaceFile = "pnpm-workspace.yaml";

export type PnpmSettings = {
  catalog: Record<string, string>;
  overrides: Record<string, string>;
  minimumReleaseAge: number | undefined;
  minimumReleaseAgeStrict: boolean;
  trustLockfile: boolean;
  ignorePnpmfile: boolean;
  configDependencies: Record<string, string>;
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
  configDependencies?: Record<string, string>;
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
    configDependencies: raw.configDependencies ?? {},
    minimumReleaseAgeExclude: raw.minimumReleaseAgeExclude ?? [],
    approvedSkills: approvedSkillsIn(raw.permissions),
  };
}

function withoutSettings(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(environment).filter(([name]) => !settingFromTheEnvironment.test(name)),
  );
}

function userConfigHome(): string {
  const configured = process.env.XDG_CONFIG_HOME;
  return configured !== undefined && isAbsolute(configured)
    ? configured
    : join(homedir(), ".config");
}

function linkInto(configHome: string, target: string, name: string): void {
  const kind = statSync(target, { throwIfNoEntry: false })?.isDirectory() ? "junction" : "file";
  try {
    symlinkSync(target, join(configHome, name), kind);
  } catch {
    return;
  }
}

function linkUserConfigBesidesPnpm(configHome: string): void {
  const userHome = userConfigHome();
  const entries = existsSync(userHome) ? readdirSync(userHome) : [];
  for (const name of entries.filter((entry) => entry !== "pnpm")) {
    linkInto(configHome, join(userHome, name), name);
  }
}

function removeConfigHome(configHome: string): void {
  for (const name of readdirSync(configHome)) {
    const entry = join(configHome, name);
    if (lstatSync(entry).isSymbolicLink()) unlinkSync(entry);
    else rmSync(entry, { recursive: true });
  }
  rmdirSync(configHome);
}

function askedForSettings(directory: string, configHome: string): string {
  try {
    return askPackageManager(["pm", "config", "list", "--json"], {
      cwd: directory,
      encoding: "utf8",
      env: { ...withoutSettings(process.env), XDG_CONFIG_HOME: configHome },
      timeout: packageManagerAnswerTimeout,
    });
  } catch (error) {
    if (!(error instanceof VitePlusNotFound)) throw error;
    throw new Error(`${workspaceFile} is read through pnpm, which vp starts. ${error.message}`, {
      cause: error,
    });
  }
}

function pnpmAnswer(directory: string): string {
  const outcome: { configHome?: string; answer?: string; failure?: unknown } = {};
  try {
    outcome.configHome = mkdtempSync(join(tmpdir(), "no-pnpm-user-config-"));
    linkUserConfigBesidesPnpm(outcome.configHome);
    outcome.answer = askedForSettings(directory, outcome.configHome);
  } catch (error) {
    outcome.failure = error;
  }
  try {
    if (outcome.configHome !== undefined) removeConfigHome(outcome.configHome);
  } catch (cleanup) {
    if (!("failure" in outcome)) throw cleanup;
  }
  if ("failure" in outcome || outcome.answer === undefined) throw outcome.failure;
  return outcome.answer;
}

export function readPnpmSettings(directory: string = repositoryRoot): PnpmSettings {
  return settingsFrom(JSON.parse(pnpmAnswer(directory)) as RawSettings);
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
