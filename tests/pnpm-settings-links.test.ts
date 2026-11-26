import type * as fs from "node:fs";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { installedVitePlusVersion } from "#/scripts/package-manager.ts";
import { readPnpmSettings, workspaceFile } from "#/scripts/pnpm-settings.ts";
import { rootManifest } from "#/scripts/repository.ts";
import { shellQuoted, writeShim } from "#/tests/support/shims.ts";

vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal<typeof fs>();
  return {
    ...original,
    symlinkSync: () => {
      throw Object.assign(new Error("EPERM: operation not permitted, symlink"), { code: "EPERM" });
    },
  };
});

const temporary: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true });
});

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "pnpm-settings-links-"));
  temporary.push(directory);
  return directory;
}

test("when an entry of the user's config home cannot be linked, readPnpmSettings leaves it out and still reads the settings", () => {
  const checkout = temporaryDirectory();
  writeFileSync(join(checkout, workspaceFile), "catalog:\n  solid-js: 2.0.0-rc.21\n");
  const configHome = temporaryDirectory();
  mkdirSync(join(configHome, "vite-plus"));
  writeFileSync(join(configHome, "vite-plus/config.json"), "{}");
  const bin = temporaryDirectory();
  const pnpm = rootManifest().packageManager?.replace("@", "/") ?? "";
  writeShim(
    bin,
    "vp",
    [
      `if [ "$1" = "--version" ]; then printf 'vp v%s\\n' ${shellQuoted(installedVitePlusVersion() ?? "")}; exit 0; fi`,
      `if [ -f "$XDG_CONFIG_HOME/vite-plus/config.json" ]; then vp=seen; else vp=left-out; fi`,
      `printf '{"userAgent":"%s","catalog":{"vite-plus config":"%s"}}' ${shellQuoted(pnpm)} "$vp"`,
    ].join("\n"),
  );
  vi.stubEnv("XDG_CONFIG_HOME", configHome);
  vi.stubEnv("PATH", `${bin}${delimiter}${process.env.PATH ?? ""}`);

  expect(readPnpmSettings(checkout).catalog).toEqual({ "vite-plus config": "left-out" });
});
