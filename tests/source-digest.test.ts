import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createServer, loadConfigFromFile, type Plugin } from "vite-plus";
import { expect, test } from "vite-plus/test";
import { libraryLayout } from "#/scripts/dist-specifiers.ts";
import { repositoryRoot } from "#/scripts/repository.ts";
import {
  assertBuiltFromItsSources,
  type BuildRecipe,
  buildWithASourceDigest,
  builtFromItsSources,
  consumedLibraries,
  digestOf,
  sourceDigestFile,
  staleBuild,
} from "#/scripts/source-digest.ts";
import { inTemporaryTree } from "#/tests/support/temporary-tree.ts";
import storybookConfig from "#/apps/storybook/.storybook/main.ts";

const pluginName = builtFromItsSources().name;
const rebuild = /run `vp run -r build`/i;
const changedWithin = 20_000;

const library = {
  "lib/package.json": JSON.stringify({
    name: "lib",
    type: "module",
    imports: { "#/*": "./*" },
    devDependencies: { dep: "1.0.0" },
  }),
  "lib/node_modules/dep/package.json": JSON.stringify({ name: "dep", version: "1.0.0" }),
  "lib/build.mjs": 'import { helper } from "./helper.mjs";\nimport "#/tools/more.mjs";\n',
  "lib/helper.mjs": "export const helper = 1;\n",
  "lib/tools/more.mjs": "export {};\n",
  "lib/src/a.ts": "export const a = 1;\n",
  "lib/src/nested/b.ts": "export const b = 2;\n",
};

function recipeIn(root: string): BuildRecipe {
  return {
    layout: libraryLayout(join(root, "lib"), { ".ts": ".js" }),
    buildScript: join(root, "lib/build.mjs"),
  };
}

async function built(recipe: BuildRecipe): Promise<void> {
  await buildWithASourceDigest(recipe, async () => {
    mkdirSync(recipe.layout.outputDirectory, { recursive: true });
    writeFileSync(join(recipe.layout.outputDirectory, "a.js"), "export const a = 1;\n");
  });
}

function handlerOf(
  hook: Plugin["buildStart"] | Plugin["load"] | Plugin["configResolved"],
): (...args: unknown[]) => unknown {
  const handler: unknown = typeof hook === "function" ? hook : hook?.handler;
  return (...args) =>
    typeof handler === "function"
      ? Reflect.apply(handler, { addWatchFile: () => undefined }, args)
      : undefined;
}

function namesOf(plugins: unknown): unknown[] {
  return [plugins]
    .flat(Infinity)
    .map((plugin: unknown) =>
      typeof plugin === "object" && plugin !== null ? Reflect.get(plugin, "name") : undefined,
    );
}

test("each library the apps consume holds the digest its build wrote of every input it reads", () => {
  for (const packageRoot of consumedLibraries) {
    expect(() => assertBuiltFromItsSources(packageRoot)).not.toThrow();
  }
});

test("the digest changes with a compiled source's content and path, an added source, a file the build script imports, the manifest and an installed dependency's version, and with no file the build does not compile", async () => {
  await inTemporaryTree(library, (root) => {
    const recipe = recipeIn(root);
    const lib = join(root, "lib");
    const digests = [digestOf(recipe)];
    const changes: (() => void)[] = [
      () => writeFileSync(join(lib, "src/a.ts"), "export const a = 2;\n"),
      () => renameSync(join(lib, "src/nested/b.ts"), join(lib, "src/nested/c.ts")),
      () => writeFileSync(join(lib, "src/d.ts"), ""),
      () => appendFileSync(join(lib, "helper.mjs"), "\n"),
      () => appendFileSync(join(lib, "tools/more.mjs"), "\n"),
      () => appendFileSync(join(lib, "package.json"), "\n"),
      () =>
        writeFileSync(
          join(lib, "node_modules/dep/package.json"),
          JSON.stringify({ name: "dep", version: "1.0.1" }),
        ),
    ];
    for (const change of changes) {
      change();
      digests.push(digestOf(recipe));
    }
    expect(new Set(digests).size).toBe(digests.length);
    writeFileSync(join(lib, "src/notes.md"), "not compiled\n");
    expect(digestOf(recipe)).toBe(digests.at(-1));
  });
});

test("a symbolic link among the sources is refused rather than followed", async () => {
  await inTemporaryTree(library, (root) => {
    symlinkSync(join(root, "lib/helper.mjs"), join(root, "lib/src/linked.ts"));
    expect(() => digestOf(recipeIn(root))).toThrow(/symbolic link/);
  });
});

test("a build whose sources change while it runs fails and writes no digest", async () => {
  await inTemporaryTree(library, async (root) => {
    const recipe = recipeIn(root);
    await expect(
      buildWithASourceDigest(recipe, async () => {
        mkdirSync(recipe.layout.outputDirectory, { recursive: true });
        writeFileSync(join(root, "lib/src/a.ts"), "export const a = 3;\n");
      }),
    ).rejects.toThrow(/sources changed during the build/);
    expect(() => assertBuiltFromItsSources(join(root, "lib"))).toThrow(
      new RegExp(`holds no ${sourceDigestFile}`),
    );
  });
});

test("a dist with no digest, or one of other inputs, is refused with the command that rebuilds it, and one built from them is taken", async () => {
  await inTemporaryTree(library, async (root) => {
    const lib = join(root, "lib");
    mkdirSync(join(lib, "dist"));
    expect(() => assertBuiltFromItsSources(lib)).toThrow(rebuild);
    await built(recipeIn(root));
    expect(() => assertBuiltFromItsSources(lib)).not.toThrow();
    const recorded: { digest?: unknown } = JSON.parse(
      readFileSync(join(lib, "dist", sourceDigestFile), "utf8"),
    );
    expect(recorded.digest).toBe(digestOf(recipeIn(root)));
    appendFileSync(join(lib, "helper.mjs"), "\n");
    expect(() => assertBuiltFromItsSources(lib)).toThrow(staleBuild);
    expect(() => assertBuiltFromItsSources(lib)).toThrow(rebuild);
  });
});

test("the plugin refuses a stale dist when a build starts and when a module of the dist loads, and takes a fresh one", async () => {
  await inTemporaryTree(library, async (root) => {
    const lib = join(root, "lib");
    await built(recipeIn(root));
    expect(() => handlerOf(builtFromItsSources([lib]).buildStart)()).not.toThrow();
    appendFileSync(join(lib, "src/a.ts"), "\n");
    expect(() => handlerOf(builtFromItsSources([lib]).buildStart)()).toThrow(staleBuild);
    const load = handlerOf(builtFromItsSources([lib]).load);
    expect(() => load(join(lib, "src/a.ts"))).not.toThrow();
    expect(() => load(join(lib, "dist/a.js"))).toThrow(staleBuild);
  });
});

test("in a Vitest project, whose global setup builds the libraries only after its server starts, the plugin leaves a stale dist to the first load of one of its modules", async () => {
  await inTemporaryTree(library, async (root) => {
    const lib = join(root, "lib");
    await built(recipeIn(root));
    appendFileSync(join(lib, "src/a.ts"), "\n");
    const plugin = builtFromItsSources([lib]);
    handlerOf(plugin.configResolved)({ test: {} });
    expect(() => handlerOf(plugin.buildStart)()).not.toThrow();
    expect(() => handlerOf(plugin.load)(join(lib, "dist/a.js"))).toThrow(staleBuild);
  });
});

test("a running server that serves the dist refuses it once a source changes, until the library is built again", async () => {
  await inTemporaryTree(library, async (root) => {
    const lib = join(root, "lib");
    await built(recipeIn(root));
    const server = await createServer({
      root: lib,
      configFile: false,
      logLevel: "silent",
      plugins: [builtFromItsSources([lib])],
      server: { middlewareMode: true, hmr: false },
    });
    const served = () =>
      server.transformRequest("/dist/a.js").then(
        () => "served",
        (error: unknown) => String(error),
      );
    try {
      expect(await served()).toBe("served");
      writeFileSync(join(lib, "src/a.ts"), "export const a = 4;\n");
      await expect.poll(served, { timeout: changedWithin }).toMatch(staleBuild);
      await built(recipeIn(root));
      await expect.poll(served, { timeout: changedWithin }).toBe("served");
    } finally {
      await server.close();
    }
  });
});

test("Storybook, for its server, its static build and its stories projects, and the playground, for its server and its build, use the plugin", async () => {
  const { viteFinal } = storybookConfig;
  const storybook: unknown =
    viteFinal === undefined ? undefined : await Reflect.apply(viteFinal, storybookConfig, [{}, {}]);
  expect(
    namesOf(
      typeof storybook === "object" && storybook !== null ? Reflect.get(storybook, "plugins") : [],
    ),
  ).toContain(pluginName);
  for (const command of ["serve", "build"] as const) {
    const loaded = await loadConfigFromFile(
      { command, mode: "production" },
      join(repositoryRoot, "apps/playground/vite.config.ts"),
    );
    expect(namesOf(loaded?.config.plugins), command).toContain(pluginName);
  }
});
