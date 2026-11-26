import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const configQuery = "pm config list --json";

export function shellQuoted(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function writeShim(directory: string, name: string, body: string): string {
  const path = join(directory, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

export type VpShim = {
  version: string;
  pnpm?: string;
  config?: string;
  answer?: string;
  status?: number;
  versionLine?: string;
  versionStatus?: number;
  versionSeconds?: number;
};

function logOf(path: string): string {
  return `${path}.calls`;
}

export function configAnswerOf(shim: Pick<VpShim, "pnpm" | "config">): string {
  return (
    shim.config ?? JSON.stringify({ userAgent: `pnpm/${shim.pnpm ?? "12.23.0"} npm/? node/?` })
  );
}

export function writeVpShim(directory: string, name: string, shim: VpShim): string {
  const path = join(directory, name);
  const versionFails =
    shim.versionStatus === undefined
      ? []
      : [`  printf 'version failed on purpose' >&2`, `  exit ${shim.versionStatus}`];
  const versionWaits = shim.versionSeconds === undefined ? [] : [`  sleep ${shim.versionSeconds}`];
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
      `if [ "$*" = ${shellQuoted(configQuery)} ]; then printf '%s' ${shellQuoted(configAnswerOf(shim))}; exit 0; fi`,
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
