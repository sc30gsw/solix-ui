import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { outputPathOf } from "../../scripts/dist-specifiers.ts";
import {
  behaviourSdkHiddenRule,
  compileLibrarySource,
  libraryLayout,
  libraryStylesheet,
} from "#/build-pipeline.mjs";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const layout = libraryLayout(packageRoot);
const { sourceDirectory } = layout;
const outputDirectory = join(packageRoot, "dist");

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const rules = [];
for (const name of await readdir(sourceDirectory)) {
  if (!Object.hasOwn(layout.outputExtensions, extname(name))) continue;
  const filename = join(sourceDirectory, name);
  const compiled = await compileLibrarySource({
    filename,
    source: await readFile(filename, "utf8"),
    packageRoot,
  });
  rules.push(...compiled.rules);
  const output = join(outputDirectory, relative(sourceDirectory, outputPathOf(filename, layout)));
  await writeFile(output, compiled.code);
  console.log(`${relative(packageRoot, filename)} -> ${relative(packageRoot, output)}`);
}

const { stylePropRules } = await import(
  pathToFileURL(join(outputDirectory, "style-prop-table.js")).href
);
await writeFile(
  join(outputDirectory, "styles.css"),
  libraryStylesheet(rules, stylePropRules(), behaviourSdkHiddenRule(packageRoot)),
);
console.log(
  `dist/styles.css: ${rules.length} rules, the style-prop rules and the SDK's hidden rule`,
);
