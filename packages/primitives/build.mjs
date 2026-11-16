import { transformAsync } from "@babel/core";
import presetTypescript from "@babel/preset-typescript";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const sourceDirectory = join(packageRoot, "src");
const outputDirectory = join(packageRoot, "dist");
const typesStripped = [presetTypescript];
const relativeSpecifier = /^\.{1,2}\//;
const sourceExtension = /\.ts$/;
const outputExtension = ".js";

function withOutputExtension(path) {
  const source = path.node.source;
  if (!source || !relativeSpecifier.test(source.value) || source.value.endsWith(outputExtension)) {
    return;
  }
  source.value = sourceExtension.test(source.value)
    ? source.value.replace(sourceExtension, outputExtension)
    : `${source.value}${outputExtension}`;
}

function relativeSpecifiersEndInJs() {
  return {
    visitor: {
      ImportDeclaration: withOutputExtension,
      ExportNamedDeclaration: withOutputExtension,
      ExportAllDeclaration: withOutputExtension,
    },
  };
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const name of await readdir(sourceDirectory)) {
  if (!sourceExtension.test(name)) continue;
  const filename = join(sourceDirectory, name);
  const { code } = await transformAsync(await readFile(filename, "utf8"), {
    filename,
    babelrc: false,
    configFile: false,
    presets: typesStripped,
    plugins: [relativeSpecifiersEndInJs],
  });
  const outputName = name.replace(sourceExtension, outputExtension);
  await writeFile(join(outputDirectory, outputName), code);
  console.log(`${relative(packageRoot, filename)} -> dist/${outputName}`);
}
