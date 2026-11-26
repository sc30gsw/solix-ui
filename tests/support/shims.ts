import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function shellQuoted(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function writeShim(directory: string, name: string, body: string): string {
  const path = join(directory, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

export type VpShim = { version: string; answer?: string; status?: number };

function logOf(path: string): string {
  return `${path}.calls`;
}

export function writeVpShim(directory: string, name: string, shim: VpShim): string {
  const path = join(directory, name);
  const failure = (shim.status ?? 0) === 0 ? [] : [`printf 'failed on purpose' >&2`];
  return writeShim(
    directory,
    name,
    [
      `printf '%s\\n' "$*" >> ${shellQuoted(logOf(path))}`,
      `if [ "$1" = "--version" ]; then printf 'vp v%s\\n' ${shellQuoted(shim.version)}; exit 0; fi`,
      `printf '%s' ${shellQuoted(shim.answer ?? "")}`,
      ...failure,
      `exit ${shim.status ?? 0}`,
    ].join("\n"),
  );
}

export function callsOf(shim: string): string[] {
  const log = logOf(shim);
  return existsSync(log)
    ? readFileSync(log, "utf8")
        .split("\n")
        .filter((line) => line !== "")
    : [];
}
