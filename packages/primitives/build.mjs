import { transformAsync } from "@babel/core";
import presetTypescript from "@babel/preset-typescript";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSources, distSpecifiers, libraryLayout } from "../../scripts/dist-specifiers.ts";

const layout = libraryLayout(dirname(fileURLToPath(import.meta.url)), { ".ts": ".js" });

await buildSources(layout, async (filename, source) => {
  const { code } = await transformAsync(source, {
    filename,
    babelrc: false,
    configFile: false,
    presets: [presetTypescript],
    plugins: [distSpecifiers(layout)],
  });
  return code;
});
