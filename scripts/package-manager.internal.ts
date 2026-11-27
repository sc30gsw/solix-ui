import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync, statSync } from "node:fs";
import { delimiter, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { repositoryRoot } from "#/scripts/repository-root.ts";

export type Seam = {
  onPath: string;
  root: string;
  vitePlus: string;
  packageManager: string | undefined;
};

export type CandidateKind = "path" | "local";

export type PresentCandidate = {
  kind: CandidateKind;
  command: string;
  prefix: readonly string[];
};

export type AbsentCandidate = {
  absent: string;
};

export type Candidate = PresentCandidate | AbsentCandidate;

type Budget = { readonly total: number | undefined; readonly deadline: number | undefined };

export const packageManagerConfigQuery = ["pm", "config", "list", "--json"] as const;

const vpVersion = /^vp v(\S+)/m;
const pnpmVersion = /^pnpm\/(\S+)/;
const pinnedPnpm = /^pnpm@([^+\s]+)/;
const packageManagerEnv = /^p?npm_config_/i;

export function pinnedPnpmOf(packageManager: string | undefined): string | undefined {
  return packageManager === undefined ? undefined : pinnedPnpm.exec(packageManager)?.[1];
}

export function withoutPackageManagerEnv(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(environment).filter(([name]) => !packageManagerEnv.test(name)),
  );
}

export class WorkingDirectoryMissing extends Error {
  readonly directory: string;

  constructor(directory: string, args: readonly string[]) {
    super(`vp ${args.join(" ")} cannot run in ${directory}, which is not a directory.`);
    this.directory = directory;
  }
}

export class VitePlusNotFound extends Error {
  readonly reasons: string[];

  constructor(args: readonly string[], reasons: string[]) {
    super(
      `No vp can answer vp ${args.join(" ")}: ${reasons.join("; ")}. Install the global vp, then run \`vp install\`.`,
    );
    this.reasons = reasons;
  }
}

export class VitePlusVersionMismatch extends Error {
  readonly command: string;
  readonly found: string | undefined;
  readonly installed: string | undefined;

  constructor(command: string, answer: string, found: string | undefined, installed?: string) {
    const answered =
      found === undefined
        ? `named no vp release in ${JSON.stringify(answer.trim().split("\n")[0] ?? "")}`
        : `answered vp ${found}`;
    const fix =
      installed === undefined
        ? "vite-plus is not installed in the repository. Run `vp install`"
        : `the repository installs vite-plus ${installed}. Install the global vp at ${installed}, or run \`vp install\` if the catalog moved`;
    super(`${command} ${answered}, but ${fix}.`);
    this.command = command;
    this.found = found;
    this.installed = installed;
  }
}

export class PackageManagerMismatch extends Error {
  readonly command: string;
  readonly directory: string;
  readonly found: string | undefined;
  readonly pinned: string | undefined;

  constructor(
    command: string,
    directory: string,
    candidateKind: CandidateKind,
    found: string | undefined,
    declared: string | undefined,
  ) {
    const pinned = pinnedPnpmOf(declared);
    const answered = found === undefined ? "by no pnpm it names" : `by pnpm ${found}`;
    const wanted =
      declared === undefined
        ? "the repository's package.json names no packageManager"
        : pinned === undefined
          ? `the repository's package.json sets packageManager to ${JSON.stringify(declared)}, not pnpm@<version>`
          : `packageManager is pnpm@${pinned}`;
    const advice =
      pinned === undefined
        ? "Set packageManager to pnpm@<version> in the repository's package.json."
        : candidateKind === "path"
          ? `Give ${directory} the repository's packageManager (pnpm@${pinned}), or install the global vp at the repository's vite-plus release so vp switches to it.`
          : `Install the global vp at the repository's vite-plus release, and give ${directory} the repository's packageManager (pnpm@${pinned}); the repository's own vp does not switch pnpm by packageManager.`;
    super(`${command} in ${directory} was answered ${answered}, but ${wanted}. ${advice}`);
    this.command = command;
    this.directory = directory;
    this.found = found;
    this.pinned = pinned;
  }
}

function stringField(value: object, key: string): string | undefined {
  const field = Reflect.get(value, key);
  return typeof field === "string" ? field : undefined;
}

function statusField(value: object): number | null | undefined {
  const field = Reflect.get(value, "status");
  return typeof field === "number" || field === null ? field : undefined;
}

export class PackageManagerQueryFailed extends Error {
  readonly command: string;
  readonly code: string | undefined;
  readonly status: number | null | undefined;
  readonly stderr: string;

  constructor(command: string, error: unknown, timeout: number | undefined) {
    const object = typeof error === "object" && error !== null ? error : undefined;
    const code = object === undefined ? undefined : stringField(object, "code");
    const status = object === undefined ? undefined : statusField(object);
    const stderr = (object === undefined ? undefined : stringField(object, "stderr"))?.trim() ?? "";
    const detail = error instanceof Error ? error.message : String(error);
    const reason =
      code === "ETIMEDOUT"
        ? timeout === undefined
          ? "timed out"
          : `gave no answer in ${timeout / 1000} seconds`
        : typeof status === "number"
          ? `exited with ${status}${stderr === "" ? "" : `: ${stderr}`}`
          : `failed: ${detail}`;
    super(`${command} ${reason}.`, { cause: error });
    this.command = command;
    this.code = code;
    this.status = status;
    this.stderr = stderr;
  }
}

function manifestOf(directory: string): Record<string, unknown> | undefined {
  const path = join(directory, "package.json");
  return existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>)
    : undefined;
}

export function installedSeam(): Seam {
  const packageManager = manifestOf(repositoryRoot)?.packageManager;
  return {
    onPath: "vp",
    root: repositoryRoot,
    vitePlus: join(repositoryRoot, "node_modules/vite-plus"),
    packageManager: typeof packageManager === "string" ? packageManager : undefined,
  };
}

export function installedVitePlusVersion(seam: Seam = installedSeam()): string | undefined {
  const version = manifestOf(seam.vitePlus)?.version;
  return typeof version === "string" ? version : undefined;
}

function scriptCandidate(seam: Seam): Candidate {
  const manifest = manifestOf(seam.vitePlus);
  if (manifest === undefined) {
    return { absent: `vite-plus is not installed in ${seam.root}` };
  }
  const bin = manifest.bin;
  const named = typeof bin === "object" && bin !== null ? Reflect.get(bin, "vp") : undefined;
  if (typeof named !== "string") {
    return { absent: `the vite-plus in ${seam.vitePlus} names no bin.vp` };
  }
  const script = join(seam.vitePlus, named);
  return existsSync(script)
    ? { kind: "local", command: process.execPath, prefix: [script] }
    : { absent: `${script}, the bin.vp of vite-plus, does not exist` };
}

export function candidatesOf(seam: Seam): Candidate[] {
  return [{ kind: "path", command: seam.onPath, prefix: [] }, scriptCandidate(seam)];
}

function commandLine(candidate: PresentCandidate, args: readonly string[]): string {
  return [candidate.command, ...candidate.prefix, ...args].join(" ");
}

function budgetOf(timeout: number | undefined): Budget {
  return timeout === undefined || !Number.isFinite(timeout) || timeout <= 0
    ? { total: undefined, deadline: undefined }
    : { total: timeout, deadline: performance.now() + timeout };
}

function timeoutFor(budget: Budget, command: string): number | undefined {
  if (budget.deadline === undefined) return undefined;
  const remaining = budget.deadline - performance.now();
  if (remaining <= 0) {
    throw new PackageManagerQueryFailed(
      command,
      Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }),
      budget.total,
    );
  }
  return Math.ceil(remaining);
}

function run(
  candidate: PresentCandidate,
  args: readonly string[],
  options: ExecFileSyncOptionsWithStringEncoding,
  budget: Budget,
): string {
  const command = commandLine(candidate, args);
  const timeout = timeoutFor(budget, command);
  try {
    return execFileSync(candidate.command, [...candidate.prefix, ...args], {
      ...options,
      timeout,
    });
  } catch (error) {
    throw new PackageManagerQueryFailed(command, error, budget.total);
  }
}

function executableOnPath(name: string, pathEnv: string | undefined): boolean {
  for (const directory of (pathEnv ?? "").split(delimiter)) {
    if (directory === "") continue;
    const candidate = join(directory, name);
    try {
      if (statSync(candidate).isFile()) {
        accessSync(candidate, constants.X_OK);
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

function whyMissing(
  candidate: PresentCandidate,
  error: unknown,
  env: NodeJS.ProcessEnv | undefined,
): string | undefined {
  if (!(error instanceof PackageManagerQueryFailed) || error.code !== "ENOENT") return undefined;
  if (candidate.command.includes("/") || candidate.command.includes("\\")) {
    return existsSync(candidate.command) ? undefined : `${candidate.command} does not exist`;
  }
  return executableOnPath(candidate.command, (env ?? process.env).PATH)
    ? undefined
    : `\`${candidate.command}\` is not on PATH`;
}

function probingVersion(
  options: ExecFileSyncOptionsWithStringEncoding,
): ExecFileSyncOptionsWithStringEncoding {
  return { ...options, stdio: ["ignore", "pipe", "pipe"] };
}

function probingConfig(
  options: ExecFileSyncOptionsWithStringEncoding,
): ExecFileSyncOptionsWithStringEncoding {
  return {
    ...options,
    env: withoutPackageManagerEnv(options.env ?? process.env),
    stdio: ["ignore", "pipe", "pipe"],
  };
}

function parseConfigObject(command: string, answer: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(answer);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new PackageManagerQueryFailed(
      command,
      new Error(`returned invalid JSON: ${detail}`, { cause: error }),
      undefined,
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    const kind = parsed === null ? "null" : Array.isArray(parsed) ? "an array" : typeof parsed;
    throw new PackageManagerQueryFailed(
      command,
      new Error(`returned ${kind}, not a JSON object`),
      undefined,
    );
  }
  return parsed as Record<string, unknown>;
}

function isConfigQuery(args: readonly string[]): boolean {
  return (
    args.length === packageManagerConfigQuery.length &&
    args.every((arg, index) => arg === packageManagerConfigQuery[index])
  );
}

function checkedAnswer(
  seam: Seam,
  candidate: PresentCandidate,
  versionAnswer: string,
  args: readonly string[],
  options: ExecFileSyncOptionsWithStringEncoding,
  directory: string,
  budget: Budget,
): string {
  const found = vpVersion.exec(versionAnswer)?.[1];
  const installed = installedVitePlusVersion(seam);
  if (found === undefined || found !== installed) {
    throw new VitePlusVersionMismatch(
      commandLine(candidate, ["--version"]),
      versionAnswer,
      found,
      installed,
    );
  }
  const configCommand = commandLine(candidate, packageManagerConfigQuery);
  const configAnswer = run(candidate, packageManagerConfigQuery, probingConfig(options), budget);
  const config = parseConfigObject(configCommand, configAnswer);
  const agent = config.userAgent ?? config["user-agent"];
  const answering = typeof agent === "string" ? pnpmVersion.exec(agent)?.[1] : undefined;
  const pinned = pinnedPnpmOf(seam.packageManager);
  if (answering === undefined || answering !== pinned) {
    throw new PackageManagerMismatch(
      configCommand,
      directory,
      candidate.kind,
      answering,
      seam.packageManager,
    );
  }
  return isConfigQuery(args) ? configAnswer : run(candidate, args, options, budget);
}

function directoryOf(cwd: ExecFileSyncOptionsWithStringEncoding["cwd"]): string {
  if (cwd === undefined) return process.cwd();
  return cwd instanceof URL ? fileURLToPath(cwd) : String(cwd);
}

export function askWith(
  seam: Seam,
  args: readonly string[],
  options: ExecFileSyncOptionsWithStringEncoding,
): string {
  const directory = directoryOf(options.cwd);
  if (!statSync(directory, { throwIfNoEntry: false })?.isDirectory()) {
    throw new WorkingDirectoryMissing(directory, args);
  }
  const budget = budgetOf(options.timeout);
  const reasons: string[] = [];
  for (const candidate of candidatesOf(seam)) {
    if ("absent" in candidate) {
      reasons.push(candidate.absent);
      continue;
    }
    let versionAnswer: string;
    try {
      versionAnswer = run(candidate, ["--version"], probingVersion(options), budget);
    } catch (error) {
      const missing = whyMissing(candidate, error, options.env);
      if (missing === undefined) throw error;
      reasons.push(missing);
      continue;
    }
    return checkedAnswer(seam, candidate, versionAnswer, args, options, directory, budget);
  }
  throw new VitePlusNotFound(args, reasons);
}
