import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSources } from "../../scripts/dist-specifiers.ts";
import {
  behaviourSdkHiddenRule,
  compileLibrarySource,
  componentLibraryLayout,
  definedVariables,
  libraryStylesheet,
} from "#/build-pipeline.mjs";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const layout = componentLibraryLayout(packageRoot);

const rules = [];
await buildSources(layout, async (filename, source) => {
  const compiled = await compileLibrarySource({ filename, source, packageRoot });
  rules.push(...compiled.rules);
  return compiled.code;
});

const { stylePropRules } = await import(
  pathToFileURL(join(layout.outputDirectory, "style-prop-table.js")).href
);
const { colorLayer, stylePropLayer } = await import(
  pathToFileURL(join(layout.outputDirectory, "layers.js")).href
);
const { colorRules } = await import(
  pathToFileURL(join(layout.outputDirectory, "color-rules.js")).href
);
await writeFile(
  join(layout.outputDirectory, "styles.css"),
  libraryStylesheet(
    rules,
    {
      [colorLayer]: colorRules(),
      [stylePropLayer]: stylePropRules(await definedVariables(layout.outputDirectory)),
    },
    behaviourSdkHiddenRule(packageRoot),
  ),
);
console.log(
  `dist/styles.css: ${rules.length} rules, the style-prop rules and the SDK's hidden rule`,
);
