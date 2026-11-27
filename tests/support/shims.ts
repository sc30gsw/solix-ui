import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  installedVitePlusVersion,
  packageManagerConfigQuery,
  pinnedPnpmOf,
} from "#/scripts/package-manager.ts";
import { rootManifest } from "#/scripts/repository.ts";

export const configQuery = packageManagerConfigQuery.join(" ");

export function pinnedPnpmVersion(): string {
  const packageManager = rootManifest().packageManager;
  const version = pinnedPnpmOf(packageManager);
  if (version === undefined) {
    throw new Error(`Expected pnpm@<version> in packageManager, got ${String(packageManager)}`);
  }
  return version;
}

export function installedVitePlusRelease(): string {
  const version = installedVitePlusVersion();
  if (version === undefined) {
    throw new Error("Expected version in node_modules/vite-plus/package.json");
  }
  return version;
}

export function shellQuoted(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function writeShim(directory: string, name: string, body: string): string {
  const path = join(directory, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

export type VpShim = {
  version: string;
  pnpm?: string;
  config?: string;
  configStatus?: number;
  configSeconds?: number;
  configScript?: readonly string[];
  answer?: string;
  answerSeconds?: number;
  status?: number;
  versionLine?: string;
  versionStatus?: number;
  versionSeconds?: number;
};

function logOf(path: string): string {
  return `${path}.calls`;
}

function configAnswerOf(shim: Pick<VpShim, "pnpm" | "config">): string {
  return (
    shim.config ??
    JSON.stringify({ userAgent: `pnpm/${shim.pnpm ?? pinnedPnpmVersion()} npm/? node/?` })
  );
}

export function writeVpShim(directory: string, name: string, shim: VpShim): string {
  const path = join(directory, name);
  const versionFails =
    shim.versionStatus === undefined
      ? []
      : [`  printf 'version failed on purpose' >&2`, `  exit ${shim.versionStatus}`];
  const versionWaits = shim.versionSeconds === undefined ? [] : [`  sleep ${shim.versionSeconds}`];
  const configWaits = shim.configSeconds === undefined ? [] : [`  sleep ${shim.configSeconds}`];
  const configBody =
    shim.configScript !== undefined
      ? shim.configScript.map((line) => `  ${line}`)
      : shim.configStatus !== undefined
        ? [`  printf 'config failed on purpose' >&2`, `  exit ${shim.configStatus}`]
        : [`  printf '%s' ${shellQuoted(configAnswerOf(shim))}`, `  exit 0`];
  const answerWaits = shim.answerSeconds === undefined ? [] : [`sleep ${shim.answerSeconds}`];
  const queryFails = (shim.status ?? 0) === 0 ? [] : [`printf 'failed on purpose' >&2`];
  return writeShim(
    directory,
    name,
    [
      `printf '%s\\n' "$*" >> ${shellQuoted(logOf(path))}`,
      `if [ "$1" = "--version" ]; then`,
      ...versionFails,
      ...versionWaits,
      `  printf '%s\\n' ${shellQuoted(shim.versionLine ?? `vp v${shim.version}`)}`,
      `  exit 0`,
      `fi`,
      `if [ "$*" = ${shellQuoted(configQuery)} ]; then`,
      ...configWaits,
      ...configBody,
      `fi`,
      ...answerWaits,
      `printf '%s' ${shellQuoted(shim.answer ?? "")}`,
      ...queryFails,
      `exit ${shim.status ?? 0}`,
    ].join("\n"),
  );
}

export function writeVpScript(path: string, shim: Pick<VpShim, "version" | "answer">): string {
  mkdirSync(dirname(path), { recursive: true });
  const log = JSON.stringify(logOf(path));
  writeFileSync(
    path,
    [
      `import { appendFileSync } from "node:fs";`,
      `const args = process.argv.slice(2).join(" ");`,
      `appendFileSync(${log}, args + "\\n");`,
      `const answers = { "--version": ${JSON.stringify(`vp v${shim.version}\n`)}, ${JSON.stringify(configQuery)}: ${JSON.stringify(configAnswerOf({}))} };`,
      `process.stdout.write(answers[args] ?? ${JSON.stringify(shim.answer ?? "")});`,
      ``,
    ].join("\n"),
  );
  return path;
}

export function writeStandInVitePlus(
  directory: string,
  version: string,
  bin: Record<string, string> = { vp: "./bin/vp.mjs" },
): string {
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({ name: "vite-plus", version, bin }),
  );
  return directory;
}

export function callsOf(shim: string): string[] {
  const log = logOf(shim);
  return existsSync(log)
    ? readFileSync(log, "utf8")
        .split("\n")
        .filter((line) => line !== "")
    : [];
}
