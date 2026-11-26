import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

export type Seam = {
  onPath: string;
  root: string;
  vitePlus: string;
  packageManager: string | undefined;
};

export type Candidate = { command: string; prefix: readonly string[]; absent?: string };

type Failure = NodeJS.ErrnoException & { status?: number | null; stderr?: unknown };

const repositoryRoot = join(import.meta.dirname, "..");
const vpVersion = /^vp v(\S+)/m;
const pnpmVersion = /^pnpm\/(\S+)/;
const pinnedPnpm = /^pnpm@([^+\s]+)/;
const configQuery = ["pm", "config", "list", "--json"];

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
  readonly found: string | undefined;
  readonly pinned: string | undefined;

  constructor(command: string, found: string | undefined, pinned: string | undefined) {
    const answered = found === undefined ? "by no pnpm it names" : `by pnpm ${found}`;
    const wanted =
      pinned === undefined
        ? "the repository's package.json names no packageManager"
        : `packageManager is pnpm@${pinned}`;
    super(
      `${command} was answered ${answered}, but ${wanted}. Install the global vp at the vite-plus release the repository installs; it runs the pnpm that packageManager names, where the repository's own vp runs whatever pnpm is on PATH.`,
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

  constructor(command: string, error: unknown, timeout: number | undefined) {
    const failure = error as Failure;
    const stderr = typeof failure.stderr === "string" ? failure.stderr.trim() : "";
    const reason =
      failure.code === "ETIMEDOUT"
        ? `gave no answer in ${(timeout ?? 0) / 1000} seconds`
        : typeof failure.status === "number"
          ? `exited with ${failure.status}${stderr === "" ? "" : `: ${stderr}`}`
          : `failed: ${failure.message}`;
    super(`${command} ${reason}.`, { cause: error });
    this.command = command;
    this.code = failure.code;
    this.status = failure.status;
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
  const candidate: Candidate = { command: process.execPath, prefix: [] };
  const manifest = manifestOf(seam.vitePlus);
  if (manifest === undefined) {
    return { ...candidate, absent: `vite-plus is not installed in ${seam.root}` };
  }
  const bin = manifest.bin;
  const named = typeof bin === "object" && bin !== null ? Reflect.get(bin, "vp") : undefined;
  if (typeof named !== "string") {
    return { ...candidate, absent: `the vite-plus in ${seam.vitePlus} names no bin.vp` };
  }
  const script = join(seam.vitePlus, named);
  return existsSync(script)
    ? { ...candidate, prefix: [script] }
    : {
        ...candidate,
        prefix: [script],
        absent: `${script}, the bin.vp of vite-plus, does not exist`,
      };
}

export function candidatesOf(seam: Seam): Candidate[] {
  return [{ command: seam.onPath, prefix: [] }, scriptCandidate(seam)];
}

function commandLine(candidate: Candidate, args: readonly string[]): string {
  return [candidate.command, ...candidate.prefix, ...args].join(" ");
}

function run(
  candidate: Candidate,
  args: readonly string[],
  options: ExecFileSyncOptionsWithStringEncoding,
): string {
  try {
    return execFileSync(candidate.command, [...candidate.prefix, ...args], options);
  } catch (error) {
    throw new PackageManagerQueryFailed(commandLine(candidate, args), error, options.timeout);
  }
}

function whyMissing(candidate: Candidate, error?: unknown): string | undefined {
  if (candidate.absent !== undefined) return candidate.absent;
  if (!(error instanceof PackageManagerQueryFailed) || error.code !== "ENOENT") return undefined;
  return candidate.command.includes("/")
    ? `${candidate.command} does not exist`
    : `\`${candidate.command}\` is not on PATH`;
}

function probing(
  options: ExecFileSyncOptionsWithStringEncoding,
): ExecFileSyncOptionsWithStringEncoding {
  return { ...options, stdio: ["ignore", "pipe", "pipe"] };
}

function checkedAnswer(
  seam: Seam,
  candidate: Candidate,
  versionAnswer: string,
  args: readonly string[],
  options: ExecFileSyncOptionsWithStringEncoding,
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
  const configAnswer = run(candidate, configQuery, probing(options));
  const config = JSON.parse(configAnswer) as Record<string, unknown>;
  const agent = config.userAgent ?? config["user-agent"];
  const answering = typeof agent === "string" ? pnpmVersion.exec(agent)?.[1] : undefined;
  const pinned =
    seam.packageManager === undefined ? undefined : pinnedPnpm.exec(seam.packageManager)?.[1];
  if (answering === undefined || answering !== pinned) {
    throw new PackageManagerMismatch(
      `${commandLine(candidate, configQuery)} in ${String(options.cwd ?? process.cwd())}`,
      answering,
      pinned,
    );
  }
  return isDeepStrictEqual([...args], configQuery) ? configAnswer : run(candidate, args, options);
}

export function askWith(
  seam: Seam,
  args: readonly string[],
  options: ExecFileSyncOptionsWithStringEncoding,
): string {
  const directory = String(options.cwd ?? process.cwd());
  if (!statSync(directory, { throwIfNoEntry: false })?.isDirectory()) {
    throw new WorkingDirectoryMissing(directory, args);
  }
  const reasons: string[] = [];
  for (const candidate of candidatesOf(seam)) {
    const absent = whyMissing(candidate);
    if (absent !== undefined) {
      reasons.push(absent);
      continue;
    }
    let versionAnswer: string;
    try {
      versionAnswer = run(candidate, ["--version"], probing(options));
    } catch (error) {
      const missing = whyMissing(candidate, error);
      if (missing === undefined) throw error;
      reasons.push(missing);
      continue;
    }
    return checkedAnswer(seam, candidate, versionAnswer, args, options);
  }
  throw new VitePlusNotFound(args, reasons);
}
