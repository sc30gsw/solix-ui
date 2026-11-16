import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { pnpmSettings, workspaceFile } from "../scripts/pnpm-settings";
import { stateOf, tabNamed } from "../apps/playground/tests/support/tabs";
import { inEveryEngine } from "./support/served-app";
import { type RunningServer, startServer } from "./support/server-process";
import {
  componentLibraries,
  libraryPackages,
  repositoryRoot,
  rootManifest,
} from "./support/workspace";

const [library] = componentLibraries;
const libraryName = library.manifest.name ?? "";
const fixtures = join(repositoryRoot, "tests/fixtures/tarball-consumer");
const builtServerPort = 4323;
const developmentServerPort = 4324;
const installAndBuildTimeout = 240_000;
const sdk = /ui-sdk|data-slot/;
const settingsAConsumerWrites = ["plugins"];
const servers: [label: string, port: number, command: string[]][] = [
  ["the built server in plain Node", builtServerPort, ["node", "dist/server/node.js"]],
  [
    "the development server",
    developmentServerPort,
    [
      "node_modules/.bin/vp",
      "dev",
      "--host",
      "127.0.0.1",
      "--port",
      String(developmentServerPort),
      "--strictPort",
    ],
  ],
];

let app: string;
let clientWithButtonOnly = "";

function run(command: string, args: string[], directory: string): string {
  return execFileSync(command, args, {
    cwd: directory,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function clientScripts(): string {
  const assets = join(app, "dist/client/assets");
  return readdirSync(assets)
    .filter((file) => file.endsWith(".js"))
    .map((file) => readFileSync(join(assets, file), "utf8"))
    .join("\n");
}

function buildWith(appSource: string): void {
  copyFileSync(join(fixtures, appSource), join(app, "src/App.tsx"));
  run(join(app, "node_modules/.bin/vp"), ["build"], app);
}

function packInto(destination: string, directory: string): string {
  const [tarball] = run("pnpm", ["pack", "--pack-destination", destination], directory)
    .split("\n")
    .filter((line) => line.endsWith(".tgz"));
  return tarball;
}

beforeAll(() => {
  const { catalog } = pnpmSettings();
  app = mkdtempSync(join(tmpdir(), "tarball-consumer-"));
  const tarballs = libraryPackages.map(({ directory, manifest }): [string, string] => [
    manifest.name ?? directory,
    `file:${packInto(app, directory)}`,
  ]);
  const versionOf = (name: string) => catalog[name];
  mkdirSync(join(app, "src"));
  copyFileSync(join(fixtures, "vite.config.ts"), join(app, "vite.config.ts"));
  writeFileSync(
    join(app, "package.json"),
    JSON.stringify({
      name: "tarball-consumer",
      private: true,
      type: "module",
      packageManager: rootManifest().packageManager,
      dependencies: {
        "@solidjs/web": versionOf("@solidjs/web"),
        ...Object.fromEntries(tarballs.filter(([name]) => name === libraryName)),
        "@stylexjs/stylex": versionOf("@stylexjs/stylex"),
        "solid-js": versionOf("solid-js"),
      },
      devDependencies: {
        "@solidjs/vite-plugin": versionOf("@solidjs/vite-plugin"),
        vite: versionOf("vite"),
        "vite-plus": versionOf("vite-plus"),
      },
    }),
  );
  writeFileSync(
    join(app, workspaceFile),
    [
      "overrides:",
      `  vite@*: "${versionOf("vite")}"`,
      ...tarballs
        .filter(([name]) => name !== libraryName)
        .map(([name, tarball]) => `  "${name}": "${tarball}"`),
      "peerDependencyRules:",
      "  allowAny:",
      "    - vite",
      "",
    ].join("\n"),
  );
  run("pnpm", ["install", "--prefer-offline", "--ignore-scripts"], app);
  buildWith("ButtonApp.tsx");
  clientWithButtonOnly = clientScripts();
  buildWith("TabsApp.tsx");
}, installAndBuildTimeout);

afterAll(() => {
  rmSync(app, { recursive: true, force: true });
});

test("a consumer installed from the packed tarball gets the SDK as a dependency of the library, resolved to the version the catalog pins, and lists none of it itself", () => {
  const besideTheLibrary = join(
    realpathSync(join(app, "node_modules", libraryName)),
    ...libraryName.split("/").map(() => ".."),
  );
  const installed = (name: string) =>
    JSON.parse(readFileSync(join(besideTheLibrary, name, "package.json"), "utf8")) as {
      version: string;
    };
  const consumer = JSON.parse(readFileSync(join(app, "package.json"), "utf8")) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  const { catalog } = pnpmSettings();

  expect(
    Object.keys({ ...consumer.dependencies, ...consumer.devDependencies }).filter((name) =>
      name.startsWith("@ui-sdk/"),
    ),
  ).toEqual([]);
  expect(installed("@ui-sdk/core").version).toBe(catalog["@ui-sdk/core"]);
  expect(installed("@ui-sdk/solid").version).toBe(catalog["@ui-sdk/solid"]);
});

test("the consumer's Vite configuration sets nothing but the Solid plugin: no dependency optimisation, no StyleX plugin, no alias", () => {
  const config = readFileSync(join(app, "vite.config.ts"), "utf8");
  const settings = [...config.matchAll(/^ {2}(\w+):/gm)].map(([, name]) => name);

  expect(settings).toEqual(settingsAConsumerWrites);
  expect(config).not.toMatch(/stylex|optimizeDeps|alias/);
});

test("a consumer that renders only a Button ships none of the SDK, and one that renders Tabs ships it", () => {
  expect(clientWithButtonOnly.length).toBeGreaterThan(0);
  expect(sdk.test(clientWithButtonOnly)).toBe(false);
  expect(sdk.test(clientScripts())).toBe(true);
});

inEveryEngine((browser) => {
  describe.each(servers)("served by %s", (_, port, command) => {
    let server: RunningServer;
    let page: Page;
    const problems: string[] = [];

    beforeAll(async () => {
      server = await startServer({ directory: app, port, command });
      page = await browser().newPage();
      page.on("console", (message) => {
        if (message.type() === "error" || message.type() === "warning") {
          problems.push(message.text());
        }
      });
      page.on("pageerror", (error) => problems.push(String(error)));
      await page.goto(server.url, { waitUntil: "networkidle" });
    }, installAndBuildTimeout);

    afterAll(async () => {
      await page.close();
      server.stop();
    });

    test("the consumer's Tabs arrive rendered, hydrate, and select by click and by arrow key, with no console error or warning", async () => {
      const state = () => stateOf(page, "Consumer");

      expect(await (await fetch(server.url)).text()).toContain('role="tablist"');
      expect(await state()).toMatchObject({ selected: "One", shown: ["One panel"] });

      await tabNamed(page, "Consumer", "Two").click();

      await expect.poll(state).toMatchObject({ selected: "Two", shown: ["Two panel"] });

      await page.keyboard.press("ArrowRight");

      await expect.poll(state).toMatchObject({ selected: "One", shown: ["One panel"] });
      expect(problems).toEqual([]);
    });
  });
});
