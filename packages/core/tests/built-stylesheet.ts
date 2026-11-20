import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import postcss from "postcss";
import {
  behaviourSdkHiddenRule,
  LIBRARY_CASCADE_LAYER,
  LIBRARY_CLASS_PREFIX,
  sdkHiddenRuleSource,
} from "#/build-pipeline.mjs";
import { colorSchemeLayer } from "#/src/layers.ts";
import { stableClassPrefix } from "#/src/stable-class.ts";
import { stylesheet as builtStylesheet } from "#/tests/built-library.ts";
import { parse, ts } from "../../../scripts/syntax";
import {
  enclosingAtRules,
  inChildRuleLayer,
  inStylePropLayer,
  layersAround,
} from "#/tests/cascade-layers.ts";

export const stylesheet = builtStylesheet.trim();
export const realHiddenRule = behaviourSdkHiddenRule(join(import.meta.dirname, ".."));
export const libraryPartCondition = `:where([class^="${stableClassPrefix}"], [class*=" ${stableClassPrefix}"])`;
export const ownerBreakpoints: [name: string, width: string][] = [
  ["xs", "36em"],
  ["sm", "48em"],
  ["md", "62em"],
  ["lg", "75em"],
  ["xl", "88em"],
];
export const ownerColorSchemes: [scheme: string, colorScheme: string][] = [
  ["light", "light"],
  ["dark", "dark"],
  ["auto", "light dark"],
];
export const ownerAttribute = "data-color-scheme";
export const whereSchemeIs = (scheme: string) => `[${ownerAttribute}="${scheme}"]`;
export const stylePropClass = `.${LIBRARY_CLASS_PREFIX}-`;
export const stylePropCustomProperty = `--${LIBRARY_CLASS_PREFIX}-`;
export const ownerSchemeHiding: [className: string, scheme: string, property: string][] = [
  [`${LIBRARY_CLASS_PREFIX}-light-hidden`, "light", `${stylePropCustomProperty}light-hidden`],
  [`${LIBRARY_CLASS_PREFIX}-dark-hidden`, "dark", `${stylePropCustomProperty}dark-hidden`],
];
export const ownerDefaultScheme = "light";
export const pageRoot = ":root";
export const builtStylePropTable = "style-prop-table.js";
export const builtLayers = "layers.js";
export const builtVariablesModule = "variables.js";
export const boxSides = ["top", "right", "bottom", "left"];
export const sidesOfLogicalPart: Record<string, string[]> = {
  inline: ["left", "right"],
  block: ["top", "bottom"],
  "inline-start": ["left"],
  "inline-end": ["right"],
  "block-start": ["top"],
  "block-end": ["bottom"],
};
export const backgroundLonghands = [
  "color",
  "image",
  "position",
  "size",
  "repeat",
  "attachment",
  "origin",
  "clip",
];

export type PlacedRule = {
  selector: string;
  media: string | undefined;
  declarations: string[];
  inStylePropLayer: boolean;
  inChildRuleLayer: boolean;
  inColorSchemeLayer: boolean;
};

export function libraryLayer(): postcss.AtRule {
  const layer = postcss
    .parse(stylesheet)
    .nodes.find(
      (node): node is postcss.AtRule =>
        node.type === "atrule" && node.name === "layer" && node.params === LIBRARY_CASCADE_LAYER,
    );
  if (!layer) {
    throw new Error(
      `packages/core/dist/styles.css: wrap the rules in @layer ${LIBRARY_CASCADE_LAYER}.`,
    );
  }
  return layer;
}

export function placedRules(): PlacedRule[] {
  const placed: PlacedRule[] = [];
  libraryLayer().walkRules((rule) => {
    const enclosing = enclosingAtRules(rule);
    placed.push({
      selector: rule.selector,
      media: enclosing.find(({ name }) => name === "media")?.params,
      declarations: rule.nodes.flatMap((node) =>
        node.type === "decl" ? [`${node.prop}:${node.value}`] : [],
      ),
      inStylePropLayer: inStylePropLayer(rule),
      inChildRuleLayer: inChildRuleLayer(rule),
      inColorSchemeLayer: layersAround(rule).includes(colorSchemeLayer),
    });
  });
  return placed;
}

export function registrations(): postcss.AtRule[] {
  const found: postcss.AtRule[] = [];
  libraryLayer().walkAtRules("property", (rule) => {
    found.push(rule);
  });
  return found;
}

export function descriptor(rule: postcss.AtRule, name: string): string | undefined {
  return rule.nodes
    ?.find((node): node is postcss.Declaration => node.type === "decl" && node.prop === name)
    ?.value.trim();
}

export function longhandsSetBy(property: string): string[] {
  const box = /^(margin|padding)(?:-([a-z-]+))?$/.exec(property);
  if (box) {
    const [, family, part] = box;
    const sides = part === undefined ? boxSides : (sidesOfLogicalPart[part] ?? [part]);
    return sides.map((side) => `${family}-${side}`);
  }
  if (property === "inset") return boxSides;
  if (property === "background") return backgroundLonghands.map((part) => `background-${part}`);
  return [property];
}

export function setsEverythingAndMore(shorthand: string, longhand: string): boolean {
  const covered = longhandsSetBy(shorthand);
  const inner = longhandsSetBy(longhand);
  return covered.length > inner.length && inner.every((side) => covered.includes(side));
}

export function stylePropLayerRules(): {
  inside: PlacedRule[];
  outside: PlacedRule[];
  childRules: PlacedRule[];
} {
  const placed = placedRules();
  return {
    inside: placed.filter((rule) => rule.inStylePropLayer && !rule.inChildRuleLayer),
    outside: placed.filter((rule) => !rule.inStylePropLayer),
    childRules: placed.filter((rule) => rule.inChildRuleLayer),
  };
}

export function depthAfterEachCharacter(css: string): number[] {
  let depth = 0;
  return css.split("").map((character) => {
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    return depth;
  });
}

export function sdkSelectors(): string[] {
  const selectors: string[] = [];
  postcss.parse(realHiddenRule).walkRules((rule) => {
    selectors.push(rule.selector);
  });
  return selectors;
}

export function sdkWhoseHiddenWriterIs(body: string): string {
  const packageRoot = mkdtempSync(join(tmpdir(), "sdk-hidden-rule-"));
  const module = join(
    packageRoot,
    "node_modules",
    sdkHiddenRuleSource.dependency,
    sdkHiddenRuleSource.module,
  );
  mkdirSync(dirname(module), { recursive: true });
  writeFileSync(module, `function ${sdkHiddenRuleSource.writer}(doc) {\n${body}\n}\n`);
  return packageRoot;
}

export function runTimeImportsOf(file: string): string[] {
  const source = parse(file);
  const imports: string[] = [];
  const visit = (node: ts.Node): void => {
    const loadsAModule =
      ts.isImportDeclaration(node) ||
      (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) ||
      (ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          node.expression.getText(source) === "require"));
    if (loadsAModule) imports.push(node.getText(source));
    node.forEachChild(visit);
  };
  visit(source);
  return imports;
}

export function colorSchemeLayerRules(): { inside: PlacedRule[]; outside: PlacedRule[] } {
  const placed = placedRules();
  return {
    inside: placed.filter((rule) => rule.inColorSchemeLayer),
    outside: placed.filter((rule) => !rule.inColorSchemeLayer),
  };
}

export type ParsedSelector = { compounds: string[]; combinators: string[]; list: boolean };

export function parseSelector(selector: string): ParsedSelector {
  const compounds = [""];
  const combinators: string[] = [];
  let depth = 0;
  let quote: string | undefined;
  let pending: string | undefined;
  let list = false;
  for (const character of selector) {
    if (quote !== undefined) {
      if (character === quote) quote = undefined;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "[" || character === "(") {
      depth += 1;
    } else if (character === "]" || character === ")") {
      depth -= 1;
    } else if (depth === 0 && character === ",") {
      list = true;
      continue;
    } else if (depth === 0 && /[\s>+~]/.test(character)) {
      pending = (pending ?? "") + character;
      continue;
    }
    if (pending !== undefined) {
      combinators.push(pending.trim() === "" ? " " : pending.trim());
      compounds.push("");
      pending = undefined;
    }
    compounds[compounds.length - 1] += character;
  }
  return { compounds, combinators, list };
}
