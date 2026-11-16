import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { parseSync, transformAsync } from "@babel/core";
import syntaxJsx from "@babel/plugin-syntax-jsx";
import presetTypescript from "@babel/preset-typescript";
import stylexPlugin from "@stylexjs/babel-plugin";
import { stableClassPrefix } from "./src/stable-class.ts";

export const LIBRARY_CASCADE_LAYER = "solix";
export const LIBRARY_CLASS_PREFIX = "sx";
export const STYLE_PROP_LAYER = "style-props";
export const HIDDEN_LAYER = "hidden";
export const BEHAVIOUR_SDK_LAYER = "ui-sdk";
export const HIDDEN_PART_SELECTOR = `[hidden]:where([class*="${stableClassPrefix}"]):not([hidden="until-found"])`;

const sdkHiddenRuleSource = {
  dependency: "@ui-sdk/core",
  module: "dist/foundation/platform/style.js",
  writer: "enforceHidden",
};

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

function stringsIn(node) {
  if (Array.isArray(node)) return node.flatMap(stringsIn);
  if (node === null || typeof node !== "object") return [];
  if (node.type === "StringLiteral") return [node.value];
  return Object.entries(node)
    .filter(([key]) => !["loc", "start", "end", "extra", "comments"].includes(key))
    .flatMap(([, value]) => stringsIn(value));
}

export function behaviourSdkHiddenRule(packageRoot) {
  const { dependency, module, writer } = sdkHiddenRuleSource;
  const file = join(realpathSync(join(packageRoot, "node_modules", dependency)), module);
  const parsed = parseSync(readFileSync(file, "utf8"), {
    babelrc: false,
    configFile: false,
    filename: file,
    sourceType: "module",
  });
  const written = parsed.program.body.find(
    (statement) => statement.type === "FunctionDeclaration" && statement.id?.name === writer,
  );
  const rules = stringsIn(written).filter((text) =>
    text.startsWith(`@layer ${BEHAVIOUR_SDK_LAYER} {`),
  );
  if (rules.length !== 1) {
    throw new Error(
      `${file}: ${writer} no longer writes one rule in @layer ${BEHAVIOUR_SDK_LAYER}. Read how this version of ${dependency} keeps a hidden part hidden, and point the build at it.`,
    );
  }
  return rules[0];
}

export function libraryStylesheet(rules, stylePropRules, behaviourSdkRules) {
  const css = stylexPlugin.processStylexRules(rules, { useLayers: true });
  return [
    `@layer ${BEHAVIOUR_SDK_LAYER}, ${LIBRARY_CASCADE_LAYER};`,
    behaviourSdkRules,
    `@layer ${LIBRARY_CASCADE_LAYER} {`,
    css,
    `@layer ${STYLE_PROP_LAYER} {`,
    stylePropRules,
    "}",
    `@layer ${HIDDEN_LAYER} {`,
    `${HIDDEN_PART_SELECTOR}{display:none}`,
    "}",
    "}",
    "",
  ].join("\n");
}
