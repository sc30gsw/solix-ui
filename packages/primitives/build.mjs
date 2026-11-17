import { transformAsync } from "@babel/core";
import presetTypescript from "@babel/preset-typescript";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { distSpecifiers, outputPathOf } from "../../scripts/dist-specifiers.ts";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const sourceDirectory = join(packageRoot, "src");
const outputDirectory = join(packageRoot, "dist");
const layout = { packageRoot, sourceDirectory, outputExtensions: { ".ts": ".js" } };
const typesStripped = [presetTypescript];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const name of await readdir(sourceDirectory)) {
  if (!Object.hasOwn(layout.outputExtensions, extname(name))) continue;
  const filename = join(sourceDirectory, name);
  const { code } = await transformAsync(await readFile(filename, "utf8"), {
    filename,
    babelrc: false,
    configFile: false,
    presets: typesStripped,
    plugins: [distSpecifiers(layout)],
  });
  const output = join(outputDirectory, relative(sourceDirectory, outputPathOf(filename, layout)));
  await writeFile(output, code);
  console.log(`${relative(packageRoot, filename)} -> ${relative(packageRoot, output)}`);
}
