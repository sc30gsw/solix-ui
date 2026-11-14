import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compileLibrarySource, libraryStylesheet } from "./build-pipeline.mjs";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const sourceDirectory = join(packageRoot, "src");
const outputDirectory = join(packageRoot, "dist");

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const rules = [];
for (const name of await readdir(sourceDirectory)) {
  if (!/\.tsx?$/.test(name)) continue;
  const filename = join(sourceDirectory, name);
  const compiled = await compileLibrarySource({
    filename,
    source: await readFile(filename, "utf8"),
    packageRoot,
  });
  rules.push(...compiled.rules);
  const outputName = name.replace(/\.tsx$/, ".jsx").replace(/\.ts$/, ".js");
  await writeFile(join(outputDirectory, outputName), compiled.code);
  console.log(`${relative(packageRoot, filename)} -> dist/${outputName}`);
}

const { stylePropRules } = await import(
  pathToFileURL(join(outputDirectory, "style-prop-table.js")).href
);
await writeFile(join(outputDirectory, "styles.css"), libraryStylesheet(rules, stylePropRules()));
console.log(`dist/styles.css: ${rules.length} rules and the style-prop rules`);
