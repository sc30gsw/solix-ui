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
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { BEHAVIOUR_SDK_LAYER } from "../packages/core/build-pipeline.mjs";
import { pnpmSettings, workspaceFile } from "../scripts/pnpm-settings";
import { allowedRuntimeDependencies } from "../scripts/runtime-dependencies";
import { stateOf, tabNamed } from "../apps/playground/tests/support/tabs";
import { browserType, enginesToVerify } from "../scripts/browser-engines.mjs";
import { sharedSettings } from "../scripts/syntax";
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
const fromOutsideTheRepository = allowedRuntimeDependencies().map(({ dependency }) => dependency);
const settingsAConsumerWrites = ["plugins"];
const settingsOfAnAppInThisRepository = join(repositoryRoot, "apps/playground/tsconfig.json");
const [engine] = enginesToVerify();
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

function compilerOptionsOf(settings: string): Record<string, unknown> {
  const { compilerOptions } = JSON.parse(readFileSync(settings, "utf8")) as {
    compilerOptions: Record<string, unknown>;
  };
  return compilerOptions;
}

function typeErrors(): string {
  try {
    run(join(app, "node_modules/.bin/tsc"), ["--project", app], app);
    return "";
  } catch (error) {
    const { stdout, stderr } = error as { stdout?: string; stderr?: string };
    return `${stdout ?? ""}${stderr ?? ""}` || String(error);
  }
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
        ...Object.fromEntries(tarballs),
        "@stylexjs/stylex": versionOf("@stylexjs/stylex"),
        "solid-js": versionOf("solid-js"),
      },
      devDependencies: {
        "@solidjs/vite-plugin": versionOf("@solidjs/vite-plugin"),
        typescript: versionOf("typescript"),
        vite: versionOf("vite"),
        "vite-plus": versionOf("vite-plus"),
      },
    }),
  );
  writeFileSync(
    join(app, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        ...compilerOptionsOf(sharedSettings),
        ...compilerOptionsOf(settingsOfAnAppInThisRepository),
        strict: true,
      },
      include: ["src"],
    }),
  );
  writeFileSync(
    join(app, workspaceFile),
    [
      "overrides:",
      `  vite@*: "${versionOf("vite")}"`,
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

test("a consumer that names every library by its packed tarball gets one copy of each, the one the component library resolves as its peer, and gets the SDK as a dependency of the component library, at the version the catalog pins, without listing it", () => {
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

  const settings = readFileSync(join(app, workspaceFile), "utf8");
  for (const { manifest } of libraryPackages) {
    const name = manifest.name ?? "";
    expect(consumer.dependencies[name], `${name} in the consumer's own manifest`).toMatch(/\.tgz$/);
    expect(settings.includes(name), `${name} in the consumer's ${workspaceFile}`).toBe(false);
    expect(realpathSync(join(besideTheLibrary, name)), name).toBe(
      realpathSync(join(app, "node_modules", name)),
    );
  }
  expect(fromOutsideTheRepository).not.toEqual([]);
  expect(
    Object.keys({ ...consumer.dependencies, ...consumer.devDependencies }).filter((name) =>
      fromOutsideTheRepository.includes(name),
    ),
  ).toEqual([]);
  for (const name of fromOutsideTheRepository) {
    expect(installed(name).version, name).toBe(catalog[name]);
  }
});

test("the consumer's Vite configuration sets nothing but the Solid plugin: no dependency optimisation, no StyleX plugin, no alias", () => {
  const config = readFileSync(join(app, "vite.config.ts"), "utf8");
  const settings = [...config.matchAll(/^ {2}(\w+):/gm)].map(([, name]) => name);

  expect(settings).toEqual(settingsAConsumerWrites);
  expect(config).not.toMatch(/stylex|optimizeDeps|alias/);
});

test("the consumer's app and every type the library hands it pass a strict type check against the installed tarballs, with the repository's compiler settings", () => {
  expect(typeErrors()).toBe("");
});

test("a consumer that renders only a Button ships none of the SDK, and one that renders Tabs ships it", () => {
  expect(clientWithButtonOnly.length).toBeGreaterThan(0);
  expect(clientWithButtonOnly.includes(BEHAVIOUR_SDK_LAYER)).toBe(false);
  expect(clientScripts().includes(BEHAVIOUR_SDK_LAYER)).toBe(true);
});

describe.each(servers)(`served by %s, in ${engine}`, (_, port, command) => {
  let browser: Browser;
  let server: RunningServer;
  let page: Page;
  const problems: string[] = [];

  beforeAll(async () => {
    server = await startServer({ directory: app, port, command });
    browser = await browserType(engine).launch();
    page = await browser.newPage();
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        problems.push(message.text());
      }
    });
    page.on("pageerror", (error) => problems.push(String(error)));
    await page.goto(server.url, { waitUntil: "networkidle" });
  }, installAndBuildTimeout);

  afterAll(async () => {
    await browser.close();
    server.stop();
  });

  test("the consumer's Tabs arrive rendered, hydrate, and select by click and by arrow key, with no console error or warning", async () => {
    const state = () => stateOf(page, "Consumer", ["One", "Two"]);

    expect(await (await fetch(server.url)).text()).toContain('role="tablist"');
    expect(await state()).toMatchObject({ selected: "One", shown: ["One panel"] });

    await tabNamed(page, "Consumer", "Two").click();

    await expect.poll(state).toMatchObject({ selected: "Two", shown: ["Two panel"] });

    await page.keyboard.press("ArrowRight");

    await expect.poll(state).toMatchObject({ selected: "One", shown: ["One panel"] });
    expect(problems).toEqual([]);
  });
});
