import { globSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { expect, inject, test } from "vite-plus/test";
import e2eConfig from "#/e2e.config.ts";
import { engineNames, enginesToVerify } from "#/scripts/browser-engines.mjs";
import { pnpmSettings } from "#/scripts/pnpm-settings.ts";
import { repositoryRoot, rootManifest } from "#/tests/support/workspace.ts";

const configKeys = ["retries", "targets", "tests"];
const targetKeys = ["app", "engine", "name"];
const anyFreePortUrl = /^http:\/\/127\.0\.0\.1:0$/;
const playgroundDirectory = "apps/playground";

function outside(keys: readonly string[], allowed: readonly string[]): string[] {
  return keys.filter((key) => !allowed.includes(key));
}

test("the e2e config sets only the tests glob, the retries and the targets, and each target only its name, engine and app, so no model, agent or key reaches a run and every step stays deterministic", () => {
  expect(
    outside(Object.keys(e2eConfig), configKeys),
    "e2e.config.ts: CI runs only deterministic e2e steps. Run agent.act, explore and bug bashes locally, with a config of their own.",
  ).toEqual([]);
  expect(e2eConfig.targets.flatMap((target) => outside(Object.keys(target), targetKeys))).toEqual(
    [],
  );
});

test("the e2e config has a target for each engine the run verifies, so a local run skips a missing engine and downloads none", () => {
  expect(e2eConfig.targets.map(({ name }) => name)).toEqual(enginesToVerify());
});

test.runIf(Boolean(process.env.CI))("in CI the e2e config has a target for every engine", () => {
  expect(e2eConfig.targets.map(({ name }) => name)).toEqual(engineNames);
});

test("each e2e target serves the built playground from its folder on a port the system gives, so two runs never meet", () => {
  for (const { app } of e2eConfig.targets) {
    expect(app.url).toMatch(anyFreePortUrl);
    expect(app.command.cwd).toBe(playgroundDirectory);
    expect(app.command.env.PORT).toBe("{port}");
  }
});

test("the e2e runner and the Vitest projects collect no file of each other's", () => {
  const e2eFiles = globSync(e2eConfig.tests, { cwd: repositoryRoot });
  const vitestFiles = Object.values(inject("testFilesOfEachProject")).flat();

  expect(e2eFiles.length).toBeGreaterThan(0);
  expect(e2eFiles.filter((file) => vitestFiles.includes(file))).toEqual([]);
  expect(e2eFiles.filter((file) => !file.endsWith(".e2e.ts"))).toEqual([]);
  expect(vitestFiles.filter((file) => file.endsWith(".e2e.ts"))).toEqual([]);
});

test("every e2e run goes through the root e2e script, which turns e2e's telemetry off, and vp run test:e2e builds the packages before it, so the suite never reads a stale build", () => {
  const scripts = rootManifest().scripts ?? {};

  expect(scripts.e2e).toBe("E2E_TELEMETRY_DISABLED=1 e2e");
  expect(scripts["test:e2e"]).toBe("vp run build:packages && vp run e2e run");
});

test("the playwright-core that @e2e-dev/web resolves is the release the catalog pins for playwright, so both runners share the installed browsers", () => {
  const web = realpathSync(join(repositoryRoot, "node_modules/@e2e-dev/web/package.json"));
  const core: { version: string } = JSON.parse(
    readFileSync(createRequire(web).resolve("playwright-core/package.json"), "utf8"),
  );

  expect(core.version).toBe(pnpmSettings().catalog.playwright);
});
