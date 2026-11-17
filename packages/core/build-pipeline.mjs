import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { parseSync, transformAsync } from "@babel/core";
import syntaxJsx from "@babel/plugin-syntax-jsx";
import presetTypescript from "@babel/preset-typescript";
import stylexPlugin from "@stylexjs/babel-plugin";
import postcss from "postcss";
import { stableClassPrefix } from "./src/stable-class.ts";

import {
  behaviourSdkLayer,
  componentLayer,
  hiddenLayer,
  libraryCascadeLayer,
  libraryLayerOrder,
  outerLayerOrder,
  stylePropClassPrefix,
  stylePropLayer,
} from "./src/style-prop-table.ts";

export const LIBRARY_CASCADE_LAYER = libraryCascadeLayer;
export const LIBRARY_CLASS_PREFIX = stylePropClassPrefix;
export const STYLE_PROP_LAYER = stylePropLayer;
export const HIDDEN_LAYER = hiddenLayer;
export const BEHAVIOUR_SDK_LAYER = behaviourSdkLayer;
export const LIBRARY_PART_CONDITION = `:where([class^="${stableClassPrefix}"], [class*=" ${stableClassPrefix}"])`;
export const HIDDEN_PART_SELECTOR = `[hidden]${LIBRARY_PART_CONDITION}:not([hidden="until-found"])`;

export const sdkHiddenRuleSource = {
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
  if (node.type === "TemplateElement") return [node.value.cooked];
  return Object.entries(node)
    .filter(([key]) => !["loc", "start", "end", "extra", "comments"].includes(key))
    .flatMap(([, value]) => stringsIn(value));
}

const hiddenDeclaration = { prop: "display", value: "none", important: true };

function asCss(text) {
  try {
    return postcss.parse(text);
  } catch (error) {
    return error.reason ?? String(error);
  }
}

function hiddenRuleProblem(cssTexts) {
  if (cssTexts.length !== 1) {
    return `${cssTexts.length} pieces of CSS, ${JSON.stringify(cssTexts)}, not one whole rule`;
  }
  const [text] = cssTexts;
  const parsed = asCss(text);
  if (typeof parsed === "string") return `${JSON.stringify(text)}, which does not parse: ${parsed}`;
  const [layer, ...others] = parsed.nodes;
  if (
    others.length > 0 ||
    layer?.type !== "atrule" ||
    layer.name !== "layer" ||
    layer.params !== BEHAVIOUR_SDK_LAYER
  ) {
    return `${JSON.stringify(text)}, which is not one @layer ${BEHAVIOUR_SDK_LAYER} block and nothing else`;
  }
  const [rule, ...otherRules] = layer.nodes ?? [];
  if (otherRules.length > 0 || rule?.type !== "rule") {
    return `${JSON.stringify(text)}, which does not hold exactly one rule in @layer ${BEHAVIOUR_SDK_LAYER}`;
  }
  const declarations = rule.nodes.map(({ type, prop, value, important }) => ({
    type,
    prop,
    value,
    important: important === true,
  }));
  const wanted = [{ type: "decl", ...hiddenDeclaration }];
  if (JSON.stringify(declarations) !== JSON.stringify(wanted)) {
    return `${JSON.stringify(text)}, which declares ${rule.nodes.map((node) => node.toString()).join("; ")}, not only ${hiddenDeclaration.prop}: ${hiddenDeclaration.value} !important`;
  }
  return undefined;
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
  const cssTexts = stringsIn(written).filter((text) => /[{}]/.test(text));
  const problem = written
    ? hiddenRuleProblem(cssTexts)
    : `nothing, since the module declares no function of that name`;
  if (problem !== undefined) {
    throw new Error(
      `${file}: ${writer} writes ${problem}. The build copies one closed @layer ${BEHAVIOUR_SDK_LAYER} block that ${writer} writes, holding one rule that declares only ${hiddenDeclaration.prop}: ${hiddenDeclaration.value} !important. Read how this version of ${dependency} keeps a hidden part hidden, and point the build at it.`,
    );
  }
  return cssTexts[0];
}

function scopedToLibraryParts(css) {
  const parsed = postcss.parse(css);
  parsed.walkRules((rule) => {
    rule.selectors = rule.selectors.map((selector) => `${selector}${LIBRARY_PART_CONDITION}`);
  });
  return parsed.toString();
}

export function libraryStylesheet(rules, stylePropRules, behaviourSdkRules) {
  const css = stylexPlugin.processStylexRules(rules, { useLayers: true });
  return [
    outerLayerOrder,
    scopedToLibraryParts(behaviourSdkRules),
    `@layer ${LIBRARY_CASCADE_LAYER} {`,
    libraryLayerOrder,
    `@layer ${componentLayer} {`,
    css,
    "}",
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
