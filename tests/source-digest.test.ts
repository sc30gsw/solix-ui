import { appendFileSync, cpSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfigFromFile, type Plugin } from "vite-plus";
import { expect, test } from "vite-plus/test";
import { repositoryRoot } from "#/scripts/repository.ts";
import {
  assertBuiltFromItsSources,
  builtFromItsSources,
  coreSources,
  sourceDigest,
  sourceDigestFile,
  writeSourceDigest,
} from "#/scripts/source-digest.ts";
import { inTemporaryTree } from "#/tests/support/temporary-tree.ts";

test("the core build writes into its dist the digest of the sources it was built from", () => {
  expect(readFileSync(join(coreSources, "../dist", sourceDigestFile), "utf8")).toBe(
    `${sourceDigest(coreSources)}\n`,
  );
  expect(() => assertBuiltFromItsSources()).not.toThrow();
});

test("the digest changes with a file's content, its path, and a file added, and with nothing else", async () => {
  await inTemporaryTree({ "src/a.ts": "a\n", "src/nested/b.ts": "b\n" }, (root) => {
    const sources = join(root, "src");
    const digests = [sourceDigest(sources)];
    expect(sourceDigest(sources)).toBe(digests[0]);
    writeFileSync(join(sources, "a.ts"), "a2\n");
    digests.push(sourceDigest(sources));
    renameSync(join(sources, "nested/b.ts"), join(sources, "nested/c.ts"));
    digests.push(sourceDigest(sources));
    writeFileSync(join(sources, "d.ts"), "");
    digests.push(sourceDigest(sources));
    expect(new Set(digests).size).toBe(digests.length);
  });
});

test("a dist with no digest, or one of other sources, is refused, with the command that rebuilds it", async () => {
  await inTemporaryTree({ "src/a.ts": "a\n", "dist/a.js": "a\n" }, (root) => {
    const sources = join(root, "src");
    const rebuild = /run `vp run -r build`/;
    expect(() => assertBuiltFromItsSources(sources)).toThrow(
      new RegExp(`dist holds no ${sourceDigestFile}`),
    );
    expect(() => assertBuiltFromItsSources(sources)).toThrow(rebuild);
    writeSourceDigest(sources);
    expect(() => assertBuiltFromItsSources(sources)).not.toThrow();
    writeFileSync(join(sources, "a.ts"), "a2\n");
    expect(() => assertBuiltFromItsSources(sources)).toThrow(/dist was built from other sources/);
    writeSourceDigest(sources);
    rmSync(join(sources, "a.ts"));
    expect(() => assertBuiltFromItsSources(sources)).toThrow(rebuild);
  });
});

const playgroundConfig = join(repositoryRoot, "apps/playground/vite.config.ts");

async function buildStartOf(plugin: Plugin): Promise<void> {
  const hook = plugin.buildStart;
  const handler = typeof hook === "function" ? hook : hook?.handler;
  await Reflect.apply(handler ?? (() => undefined), undefined, []);
}

test("the playground's development server and build start only from a library dist built from the sources the library holds now, and otherwise say how to rebuild it", async () => {
  for (const command of ["serve", "build"] as const) {
    const loaded = await loadConfigFromFile({ command, mode: "production" }, playgroundConfig);
    const names = (loaded?.config.plugins ?? []).flat().map((plugin) => {
      const named: unknown = plugin;
      return typeof named === "object" && named !== null ? Reflect.get(named, "name") : undefined;
    });
    expect(names, command).toContain(builtFromItsSources().name);
  }
  await expect(buildStartOf(builtFromItsSources())).resolves.toBeUndefined();

  await inTemporaryTree({}, async (root) => {
    const copy = join(root, "core");
    for (const part of ["src", "dist"]) {
      cpSync(join(coreSources, "..", part), join(copy, part), { recursive: true });
    }
    const copied = builtFromItsSources(join(copy, "src"));
    await expect(buildStartOf(copied)).resolves.toBeUndefined();
    appendFileSync(join(copy, "src/Button.tsx"), "\n");
    await expect(buildStartOf(copied)).rejects.toThrow(
      /core\/dist was built from other sources than .*core\/src holds now.*run `vp run -r build`/,
    );
  });
});
