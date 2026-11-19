import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { Browser, Page } from "playwright";
import semver from "semver";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { pnpmSettings, workspaceFile } from "#/scripts/pnpm-settings.ts";
import { solidPackages } from "#/scripts/newest-releases.ts";
import { allowedRuntimeDependencyNames } from "#/scripts/runtime-dependencies.ts";
import { stateOf, tabNamed } from "#/apps/playground/tests/support/tabs.ts";
import { browserType, enginesToVerify } from "#/scripts/browser-engines.mjs";
import { isRelative } from "#/scripts/subpath.ts";
import {
  descendants,
  firstLine,
  moduleSpecifierOf,
  parse,
  sharedSettings,
  ts,
} from "#/scripts/syntax.ts";
import {
  type RunningServer,
  startServer,
  viteOnAFreePort,
} from "#/tests/support/server-process.ts";
import {
  type ExportTarget,
  type Manifest,
  componentLibraries,
  installedVersions,
  installedVp,
  libraryPackages,
  packageManagerAnswerTimeout,
  repositoryRoot,
  rootManifest,
} from "#/tests/support/workspace.ts";

const [library] = componentLibraries;
const libraryName = library.manifest.name ?? "";
const fixtures = join(repositoryRoot, "tests/fixtures/tarball-consumer");
const installAndBuildTimeout = 240_000;
const packTimeout = packageManagerAnswerTimeout * libraryPackages.length;
const fromOutsideTheRepository = allowedRuntimeDependencyNames();
const settingsAConsumerWrites = ["plugins"];
const subpathImportPrefix = "#";
const settingsOfAnAppInThisRepository = join(repositoryRoot, "apps/playground/tsconfig.json");
const [engine] = enginesToVerify();
const servers: [label: string, command: string[]][] = [
  ["the built server in plain Node", ["node", "dist/server/node.js"]],
  ["the development server", ["node_modules/.bin/vp", "dev", ...viteOnAFreePort]],
];

type Packed = {
  path: string;
  directory: string;
  manifest: Manifest;
  tarball: string;
  files: string[];
};

let app: string;
let packed: Packed[] = [];
let clientModulesWithButtonOnly: string[] = [];

function run(command: string, args: string[], directory: string): string {
  return execFileSync(command, args, {
    cwd: directory,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function clientModules(): string[] {
  const assets = join(app, "dist/client/assets");
  return readdirSync(assets)
    .filter((file) => file.endsWith(".js.map"))
    .flatMap((file) => {
      const { sources, sourceRoot = "" } = JSON.parse(readFileSync(join(assets, file), "utf8")) as {
        sources: string[];
        sourceRoot?: string;
      };
      return sources.map((source) => resolve(assets, sourceRoot, source));
    })
    .map((module) => (existsSync(module) ? realpathSync(module) : module));
}

function besideTheLibrary(): string {
  return join(
    realpathSync(join(app, "node_modules", libraryName)),
    ...libraryName.split("/").map(() => ".."),
  );
}

function ofTheSdk(modules: string[]): string[] {
  const packages = fromOutsideTheRepository.map((name) =>
    realpathSync(join(besideTheLibrary(), name)),
  );
  return modules.filter((module) => packages.some((home) => module.startsWith(`${home}/`)));
}

function buildWith(appSource: string): void {
  copyFileSync(join(fixtures, appSource), join(app, "src/App.tsx"));
  run(join(app, "node_modules/.bin/vp"), ["build", "--sourcemap"], app);
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

function packInto(destination: string, directory: string): Pick<Packed, "tarball" | "files"> {
  const answer = execFileSync(
    installedVp,
    ["pm", "pack", "--json", "--pack-destination", destination],
    {
      cwd: directory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: packageManagerAnswerTimeout,
    },
  );
  const result: unknown = JSON.parse(answer);
  const filename =
    typeof result === "object" && result !== null && "filename" in result
      ? result.filename
      : undefined;
  const files =
    typeof result === "object" && result !== null && "files" in result ? result.files : undefined;
  if (typeof filename !== "string" || !Array.isArray(files)) {
    throw new Error(
      `${directory}: the pack named no tarball or listed no files. It answered: ${answer}`,
    );
  }
  return { tarball: filename, files: files.map((file: { path: string }) => file.path) };
}

function exportedFiles(target: ExportTarget | undefined): string[] {
  if (target === undefined || target === null) return [];
  if (typeof target === "string") return [target.replace(/^\.\//, "")];
  return Object.values(target).flatMap(exportedFiles);
}

function filesBeside(directory: string, exported: string[]): string[] {
  const folders = new Set(exported.flatMap((file) => file.split("/").slice(0, 1)));
  return [...folders].flatMap((folder) =>
    globSync(`${folder}/**`, { cwd: directory, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => relative(directory, join(entry.parentPath, entry.name)).split(sep).join("/")),
  );
}

beforeAll(() => {
  app = mkdtempSync(join(tmpdir(), "tarball-consumer-"));
  packed = libraryPackages.map((library) => ({ ...library, ...packInto(app, library.directory) }));
}, packTimeout);

afterAll(() => {
  rmSync(app, { recursive: true, force: true });
});

test("every library exports a file, and the tarball the consumer installs holds every file its exports name and every file in their folders", () => {
  const violations = packed.flatMap(({ path, directory, manifest, files }) => {
    const exported = [...new Set(exportedFiles(manifest.exports))];
    const needed = [...new Set([...exported, ...filesBeside(directory, exported)])];
    return [
      ...(exported.length === 0 ? [`${path}: package "${manifest.name}" exports no file.`] : []),
      ...needed
        .filter((file) => !files.includes(file))
        .map(
          (file) =>
            `${path}: the packed tarball of "${manifest.name}" leaves out ${file}, which "exports" names or which sits in the folder of a file they name.`,
        ),
    ];
  });

  expect(packed.length).toBeGreaterThan(1);
  expect(violations).toEqual([]);
});

describe("installed into a consumer outside the workspace", () => {
  beforeAll(() => {
    const { catalog } = pnpmSettings();
    const tarballs = packed.map(({ directory, manifest, tarball }): [string, string] => [
      manifest.name ?? directory,
      `file:${tarball}`,
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
        `  "vite@*": ${JSON.stringify(versionOf("vite"))}`,
        "peerDependencyRules:",
        "  allowAny:",
        "    - vite",
        "",
      ].join("\n"),
    );
    run("pnpm", ["install", "--prefer-offline", "--ignore-scripts"], app);
    buildWith("ButtonApp.tsx");
    clientModulesWithButtonOnly = clientModules();
    buildWith("TabsApp.tsx");
  }, installAndBuildTimeout);

  test("a consumer that names every library by its packed tarball gets one copy of each, the one the component library resolves as its peer, and gets the SDK as a dependency of the component library, at the version the catalog pins, without listing it", () => {
    const installed = (name: string) =>
      JSON.parse(readFileSync(join(besideTheLibrary(), name, "package.json"), "utf8")) as {
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
      expect(consumer.dependencies[name], `${name} in the consumer's own manifest`).toMatch(
        /\.tgz$/,
      );
      expect(settings.includes(name), `${name} in the consumer's ${workspaceFile}`).toBe(false);
      expect(realpathSync(join(besideTheLibrary(), name)), name).toBe(
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

  test("the consumer installs one copy of every package on the Solid 2 channel: each it names at the release the catalog pins, and each other one inside the range the installed packages it names give for it", () => {
    const { catalog } = pnpmSettings();
    const manifestIn = (path: string) =>
      JSON.parse(readFileSync(join(path, "package.json"), "utf8")) as Manifest;
    const own = manifestIn(app);
    const named = Object.keys({ ...own.dependencies, ...own.devDependencies });
    const requirers = installedVersions(named, app).map(({ name, version, path }) => {
      if (path === undefined)
        throw new Error(`${name}@${version}: the package manager gives no path for it.`);
      return manifestIn(path);
    });
    const installed = installedVersions(solidPackages, app);
    const problems = solidPackages.flatMap((name) => {
      const copies = installed.filter((each) => each.name === name).map(({ version }) => version);
      const [version] = copies;
      if (version === undefined || copies.length > 1) {
        return [`${name}: ${copies.length} copies (${copies.join(", ")}), not one`];
      }
      if (named.includes(name)) {
        return version === catalog[name]
          ? []
          : [
              `${name} ${version}, not ${catalog[name] ?? "a pinned release"}, which the catalog pins`,
            ];
      }
      const ranges = requirers.flatMap(
        (manifest) => manifest.dependencies?.[name] ?? manifest.optionalDependencies?.[name] ?? [],
      );
      if (ranges.length === 0) return [`${name}: no package the consumer names requires it`];
      return ranges
        .filter((range) => !semver.satisfies(version, range))
        .map(
          (range) =>
            `${name} ${version}, outside ${range}, which a package the consumer names gives`,
        );
    });

    expect(problems).toEqual([]);
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

  test("no module a library ships in dist names a subpath import, and each relative one names a file the tarball holds", () => {
    const violations = libraryPackages.flatMap(({ manifest }) => {
      const installed = realpathSync(join(app, "node_modules", manifest.name ?? ""));
      const files = globSync("dist/**/*.{js,jsx,mjs}", { cwd: installed });
      return files.flatMap((file) =>
        descendants(parse(join(installed, file))).flatMap((node) => {
          const specifier = moduleSpecifierOf(node);
          if (!specifier || !ts.isStringLiteralLikeNode(specifier)) return [];
          const where = `${manifest.name}/${file}: ${firstLine(node)}`;
          if (specifier.text.startsWith(subpathImportPrefix)) {
            return [`${where} names a subpath import, which a consumer's tools may not resolve.`];
          }
          return isRelative(specifier.text) &&
            !existsSync(resolve(installed, dirname(file), specifier.text))
            ? [`${where} names a file the tarball does not hold.`]
            : [];
        }),
      );
    });

    expect(violations).toEqual([]);
  });

  test("a consumer that renders only a Button bundles no module of the SDK's packages into its client scripts, by the source maps of its build, and one that renders Tabs bundles some", () => {
    expect(clientModulesWithButtonOnly).not.toEqual([]);
    expect(ofTheSdk(clientModulesWithButtonOnly)).toEqual([]);
    expect(ofTheSdk(clientModules())).not.toEqual([]);
  });

  describe.each(servers)(`served by %s, in ${engine}`, (_, command) => {
    let browser: Browser;
    let server: RunningServer;
    let page: Page;
    const problems: string[] = [];

    beforeAll(async () => {
      server = await startServer({ directory: app, command });
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
      await server.stop();
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
});
