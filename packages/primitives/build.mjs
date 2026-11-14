import { transformAsync } from "@babel/core";
import presetTypescript from "@babel/preset-typescript";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const sourceDirectory = join(packageRoot, "src");
const outputDirectory = join(packageRoot, "dist");
const typesStripped = [[presetTypescript, { onlyRemoveTypeImports: true }]];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const name of await readdir(sourceDirectory)) {
  if (!name.endsWith(".ts")) continue;
  const filename = join(sourceDirectory, name);
  const { code } = await transformAsync(await readFile(filename, "utf8"), {
    filename,
    babelrc: false,
    configFile: false,
    presets: typesStripped,
  });
  const outputName = name.replace(/\.ts$/, ".js");
  await writeFile(join(outputDirectory, outputName), code);
  console.log(`${relative(packageRoot, filename)} -> dist/${outputName}`);
}
