import { transformAsync } from "@babel/core";
import presetTypescript from "@babel/preset-typescript";
import stylexPlugin from "@stylexjs/babel-plugin";

export const LIBRARY_CASCADE_LAYER = "solix";
export const LIBRARY_CLASS_PREFIX = "sx";

const typesStrippedJsxKept = [[presetTypescript, { onlyRemoveTypeImports: true }]];

export async function compileLibrarySource({ filename, source, packageRoot }) {
  const result = await transformAsync(source, {
    filename,
    babelrc: false,
    configFile: false,
    presets: typesStrippedJsxKept,
    plugins: [
      [
        stylexPlugin,
        {
          dev: false,
          runtimeInjection: false,
          classNamePrefix: LIBRARY_CLASS_PREFIX,
          treeshakeCompensation: true,
          unstable_moduleResolution: { type: "commonJS", rootDir: packageRoot },
        },
      ],
    ],
  });
  return { code: result.code, rules: result.metadata.stylex ?? [] };
}

export function libraryStylesheet(rules) {
  const css = stylexPlugin.processStylexRules(rules, { useLayers: true });
  return `@layer ${LIBRARY_CASCADE_LAYER} {\n${css}\n}\n`;
}
