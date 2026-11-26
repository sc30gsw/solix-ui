import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from "node:child_process";
import { type Dirent, existsSync, globSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";

export const repositoryRoot = join(import.meta.dirname, "..");
export const installedVp = join(repositoryRoot, "node_modules/.bin/vp");
export const installedVitePlus = join(repositoryRoot, "node_modules/vite-plus");
export const packageManagerAnswerTimeout = 30_000;

export type VpCandidate = { command: string; script?: string };

export const vpCandidates: readonly VpCandidate[] = [
  { command: "vp" },
  { command: process.execPath, script: join(installedVitePlus, "bin/vp") },
];

export class VitePlusNotFound extends Error {
  readonly tried: string[];

  constructor(tried: string[]) {
    super(
      `No vp answered: ${listed(tried)} is neither on PATH nor installed here. Install Vite+, then run \`vp install\`.`,
    );
    this.tried = tried;
  }
}

export class VitePlusVersionMismatch extends Error {
  readonly command: string;
  readonly found: string;
  readonly pinned: string;

  constructor(command: string, found: string, pinned: string) {
    super(
      `${command} answered ${found}, but the repository installs vite-plus ${pinned}, the release the catalog pins. Install that release, or run the script through \`vp run\`.`,
    );
    this.command = command;
    this.found = found;
    this.pinned = pinned;
  }
}

export class PackageManagerQueryFailed extends Error {
  readonly command: string;
  readonly code: string | undefined;
  readonly status: number | null | undefined;
  readonly stderr: string;

  constructor(command: string, error: unknown) {
    const failure = error as NodeJS.ErrnoException & { status?: number | null; stderr?: unknown };
    const stderr = typeof failure.stderr === "string" ? failure.stderr : "";
    const reason =
      failure.code === "ETIMEDOUT"
        ? `gave no answer in ${packageManagerAnswerTimeout / 1000} seconds`
        : typeof failure.status === "number"
          ? `exited with ${failure.status}${stderr.trim() === "" ? "" : `: ${stderr.trim()}`}`
          : `failed: ${failure.message}`;
    super(`${command} ${reason}.`, { cause: error });
    this.command = command;
    this.code = failure.code;
    this.status = failure.status;
    this.stderr = stderr;
  }
}

const vpVersion = /^vp v(\S+)/;
const answeredVersions = new Map<string, string>();

function commandLine(candidate: VpCandidate, args: readonly string[]): string {
  return [
    candidate.command,
    ...(candidate.script === undefined ? [] : [candidate.script]),
    ...args,
  ].join(" ");
}

function run(
  candidate: VpCandidate,
  args: readonly string[],
  options: ExecFileSyncOptionsWithStringEncoding,
): string {
  const argv = candidate.script === undefined ? args : [candidate.script, ...args];
  try {
    return execFileSync(candidate.command, argv, options);
  } catch (error) {
    throw new PackageManagerQueryFailed(commandLine(candidate, args), error);
  }
}

function isMissing(candidate: VpCandidate, error: unknown): boolean {
  return (
    candidate.script === undefined &&
    error instanceof PackageManagerQueryFailed &&
    error.code === "ENOENT"
  );
}

export function pinnedVitePlus(): string {
  const manifest = join(installedVitePlus, "package.json");
  if (!existsSync(manifest)) {
    throw new Error(`vite-plus is not installed in ${repositoryRoot}; run \`vp install\`.`);
  }
  return (JSON.parse(readFileSync(manifest, "utf8")) as { version: string }).version;
}

function checkVersion(
  candidate: VpCandidate,
  options: ExecFileSyncOptionsWithStringEncoding,
): void {
  const key = commandLine(candidate, []);
  const pinned = pinnedVitePlus();
  let found = answeredVersions.get(key);
  if (found === undefined) {
    const answer = run(candidate, ["--version"], {
      cwd: options.cwd,
      env: options.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: packageManagerAnswerTimeout,
    });
    found = vpVersion.exec(answer)?.[1] ?? (answer.trim().split("\n")[0] || "nothing");
    answeredVersions.set(key, found);
  }
  if (found !== pinned) {
    throw new VitePlusVersionMismatch(commandLine(candidate, ["--version"]), found, pinned);
  }
}

export function askPackageManager(
  args: readonly string[],
  options: ExecFileSyncOptionsWithStringEncoding,
  candidates: readonly VpCandidate[] = vpCandidates,
): string {
  const cwd = options.cwd ?? process.cwd();
  if (!statSync(cwd, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`vp ${args.join(" ")} cannot run in ${String(cwd)}, which is not a directory.`);
  }
  const tried: string[] = [];
  for (const candidate of candidates) {
    if (candidate.script !== undefined && !existsSync(candidate.script)) {
      tried.push(commandLine(candidate, []));
      continue;
    }
    try {
      checkVersion(candidate, options);
    } catch (error) {
      if (!isMissing(candidate, error)) throw error;
      tried.push(commandLine(candidate, []));
      continue;
    }
    return run(candidate, args, options);
  }
  throw new VitePlusNotFound(tried);
}

const generatedOrInstalled = new Set(["node_modules", "dist", ".git"]);

export function outsideGeneratedOrInstalled(entry: string | Dirent): boolean {
  return (typeof entry === "string" ? entry : entry.name)
    .split(sep)
    .some((segment) => generatedOrInstalled.has(segment));
}

export function manifestPaths(root: string = repositoryRoot): string[] {
  return globSync("**/package.json", { cwd: root, exclude: outsideGeneratedOrInstalled });
}

const scriptFile = "*.{ts,tsx,mjs,cjs,js}";

export function scriptFilesIn(root: string = repositoryRoot): string[] {
  return globSync(`**/${scriptFile}`, { cwd: root, exclude: outsideGeneratedOrInstalled });
}

export function scriptFilesInDotDirectoriesIn(root: string = repositoryRoot): string[] {
  return globSync(`**/.*/**/${scriptFile}`, { cwd: root, exclude: outsideGeneratedOrInstalled });
}

export type Installed = { name: string; version: string; path?: string };

export type ExportTarget = string | null | ExportTarget[] | { [condition: string]: ExportTarget };

export type Manifest = {
  name?: string;
  license?: string;
  exports?: ExportTarget;
  imports?: Record<string, string>;
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

export function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

export function listed(names: readonly string[]): string {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export type Dependent = {
  name: string;
  version?: string;
  path?: string;
  depField?: string;
  dependents?: Dependent[];
};

export function whyInstalled(
  names: readonly string[],
  directory: string = repositoryRoot,
): Dependent[] {
  const answer = askPackageManager(["why", ...names, "-r", "--json"], {
    cwd: directory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: packageManagerAnswerTimeout,
  });
  const installed: unknown = JSON.parse(answer);
  if (!Array.isArray(installed)) throw new Error(`The package manager answered: ${answer}`);
  return installed;
}

export function installedVersions(
  names: readonly string[],
  directory: string = repositoryRoot,
): Installed[] {
  return whyInstalled(names, directory).map(({ name, version = "", path }) => ({
    name,
    version,
    path,
  }));
}
