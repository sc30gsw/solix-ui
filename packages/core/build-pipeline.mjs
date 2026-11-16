import { transformAsync } from "@babel/core";
import syntaxJsx from "@babel/plugin-syntax-jsx";
import presetTypescript from "@babel/preset-typescript";
import stylexPlugin from "@stylexjs/babel-plugin";

export const LIBRARY_CASCADE_LAYER = "solix";
export const LIBRARY_CLASS_PREFIX = "sx";
export const STYLE_PROP_LAYER = "style-props";

const typesStripped = [presetTypescript];
const jsxKeptInTsx = [{ test: /\.tsx$/, plugins: [syntaxJsx] }];

export async function compileLibrarySource({ filename, source, packageRoot }) {
  const result = await transformAsync(source, {
    filename,
    babelrc: false,
    configFile: false,
    presets: typesStripped,
    overrides: jsxKeptInTsx,
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

export function libraryStylesheet(rules, stylePropRules) {
  const css = stylexPlugin.processStylexRules(rules, { useLayers: true });
  return `@layer ${LIBRARY_CASCADE_LAYER} {\n${css}\n@layer ${STYLE_PROP_LAYER} {\n${stylePropRules}\n}\n}\n`;
}
