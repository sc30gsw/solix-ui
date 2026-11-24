import { transformAsync } from "@babel/core";
import presetTypescript from "@babel/preset-typescript";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSources, distSpecifiers, libraryLayout } from "../../scripts/dist-specifiers.ts";
import { buildWithASourceDigest } from "../../scripts/source-digest.ts";

const buildScript = fileURLToPath(import.meta.url);
const layout = libraryLayout(dirname(buildScript), { ".ts": ".js" });

await buildWithASourceDigest({ layout, buildScript }, () =>
  buildSources(layout, async (filename, source) => {
    const { code } = await transformAsync(source, {
      filename,
      babelrc: false,
      configFile: false,
      presets: [presetTypescript],
      plugins: [distSpecifiers(layout)],
    });
    return code;
  }),
);
