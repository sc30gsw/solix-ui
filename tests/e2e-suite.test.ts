import { globSync } from "node:fs";
import { expect, inject, test } from "vite-plus/test";
import e2eConfig from "#/e2e.config.ts";
import { engineNames } from "#/scripts/browser-engines.mjs";
import { rootManifest } from "#/tests/support/workspace.ts";

const servedPlayground = {
  executable: process.execPath,
  args: ["dist/server/node.js"],
  cwd: "apps/playground",
};
const anyFreePortUrl = /^http:\/\/127\.0\.0\.1:0$/;
const keysThatGiveAModelOrAKey = ["agents", "credentials", "secrets", "cache", "filters"];

test("the e2e suite runs deterministic steps only: its config gives no model, agent, credential or secret", () => {
  const given = keysThatGiveAModelOrAKey.filter((key) => key in e2eConfig);

  expect(
    given,
    "e2e.config.ts: CI runs only deterministic e2e steps (Q186). Run agent.act, explore and bug bashes locally, with a config of their own.",
  ).toEqual([]);
});

test("the e2e suite has a target for each engine the project verifies, each starting the built playground on a port the system gives", () => {
  const targets = e2eConfig.targets.map(({ name, app }) => ({
    name,
    url: app.url,
    command: {
      executable: app.command.executable,
      args: app.command.args,
      cwd: app.command.cwd,
    },
    port: app.command.env.PORT,
  }));

  expect(targets).toEqual(
    engineNames.map((name) => ({
      name,
      url: expect.stringMatching(anyFreePortUrl),
      command: servedPlayground,
      port: "{port}",
    })),
  );
});

test("the e2e runner and the Vitest projects collect no file of each other's", () => {
  const e2eFiles = globSync(e2eConfig.tests);
  const vitestFiles = Object.values(inject("testFilesOfEachProject")).flat();

  expect(e2eFiles.length).toBeGreaterThan(0);
  expect(e2eFiles.filter((file) => vitestFiles.includes(file))).toEqual([]);
  expect(e2eFiles.filter((file) => !file.endsWith(".e2e.ts"))).toEqual([]);
  expect(vitestFiles.filter((file) => file.endsWith(".e2e.ts"))).toEqual([]);
});

test("vp run test:e2e builds the packages before e2e runs, so the suite never reads a stale build, and sends no telemetry", () => {
  expect(rootManifest().scripts?.["test:e2e"]).toBe(
    "NODE_ENV=production vp run -r build && E2E_TELEMETRY_DISABLED=1 e2e run",
  );
});
