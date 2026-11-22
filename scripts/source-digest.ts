import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { Plugin } from "vite-plus";
import { repositoryRoot } from "#/scripts/repository.ts";
import { insideOf, posix } from "#/scripts/subpath.ts";

export const sourceDigestFile = "source-digest.txt";
export const coreSources = join(repositoryRoot, "packages/core/src");

const rebuild = "vp run -r build";

function outputOf(sourceDirectory: string): string {
  return join(dirname(sourceDirectory), "dist");
}

function shown(path: string): string {
  return insideOf(repositoryRoot, path) ? posix(relative(repositoryRoot, path)) : path;
}

export function sourceDigest(sourceDirectory: string): string {
  const files = readdirSync(sourceDirectory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => posix(relative(sourceDirectory, join(entry.parentPath, entry.name))))
    .toSorted();
  const hash = createHash("sha256");
  for (const file of files) {
    const content = readFileSync(join(sourceDirectory, file));
    hash.update(`${file}\0${content.length}\0`).update(content);
  }
  return hash.digest("hex");
}

export function writeSourceDigest(sourceDirectory: string): void {
  const output = outputOf(sourceDirectory);
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, sourceDigestFile), `${sourceDigest(sourceDirectory)}\n`);
}

export function assertBuiltFromItsSources(sourceDirectory: string = coreSources): void {
  const output = outputOf(sourceDirectory);
  const digestFile = join(output, sourceDigestFile);
  if (!existsSync(digestFile)) {
    throw new Error(
      `${shown(output)} holds no ${sourceDigestFile}, so nothing tells which sources it was built from; run \`${rebuild}\`.`,
    );
  }
  if (readFileSync(digestFile, "utf8").trim() !== sourceDigest(sourceDirectory)) {
    throw new Error(
      `${shown(output)} was built from other sources than ${shown(sourceDirectory)} holds now, so what renders would not match them; run \`${rebuild}\`.`,
    );
  }
}

export function builtFromItsSources(sourceDirectory: string = coreSources): Plugin {
  return {
    name: "solix:built-from-its-sources",
    buildStart() {
      assertBuiltFromItsSources(sourceDirectory);
    },
  };
}
