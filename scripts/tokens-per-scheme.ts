import postcss from "postcss";
import { holdsSchemeValues, type SchemeValues, schemeValues } from "#/scripts/tokens.ts";

type Declarations = [property: string, value: string][];

export type TokensPerScheme = {
  css: string;
  tokens: { [Scheme in keyof SchemeValues]: Declarations };
};

const pageRoot = ":root";
const layerRule = "layer";

function isAtRule(node: postcss.Node | undefined): node is postcss.AtRule {
  return node?.type === "atrule";
}

function isRule(node: postcss.Node | undefined): node is postcss.Rule {
  return node?.type === "rule";
}

function conditionsAround(node: postcss.Node): postcss.AtRule[] {
  const parent = node.parent;
  if (!isAtRule(parent)) return [];
  return [...(parent.name === layerRule ? [] : [parent]), ...conditionsAround(parent)];
}

function problemOf(
  declaration: postcss.Declaration,
  seen: ReadonlySet<string>,
): string | undefined {
  const rule = declaration.parent;
  if (!declaration.prop.startsWith("--")) return "is not the value of a custom property";
  if (schemeValues(declaration.value) === undefined) {
    return "is not one light-dark(<light>, <dark>) and nothing else";
  }
  if (declaration.important) {
    return "is !important, which the rule of each scheme could not outrank";
  }
  if (!isRule(rule) || !rule.selectors.includes(pageRoot)) {
    return `is not declared on ${pageRoot}, where the rule of each scheme can replace it`;
  }
  const [condition] = conditionsAround(rule);
  if (condition !== undefined) {
    return `sits inside @${condition.name} ${condition.params}, a condition the rule of each scheme would drop`;
  }
  if (seen.has(declaration.prop)) return `is declared twice on ${pageRoot}`;
  return undefined;
}

export function tokensPerScheme(css: string, defaultScheme: keyof SchemeValues): TokensPerScheme {
  const parsed = postcss.parse(css);
  const tokens: TokensPerScheme["tokens"] = { light: [], dark: [] };
  const seen = new Set<string>();
  parsed.walkDecls((declaration) => {
    if (!holdsSchemeValues(declaration.value)) return;
    const problem = problemOf(declaration, seen);
    const values = schemeValues(declaration.value);
    if (problem !== undefined || values === undefined) {
      throw new Error(
        `${declaration.prop}: its value, ${declaration.value}, ${problem}. The build gives each colour scheme the value a token names for it only from a custom property on ${pageRoot} written light-dark(<light>, <dark>), and lets no other light-dark() reach the stylesheet, since a consumer's build tool may resolve it at ${pageRoot}.`,
      );
    }
    seen.add(declaration.prop);
    tokens.light.push([declaration.prop, values.light]);
    tokens.dark.push([declaration.prop, values.dark]);
    declaration.value = values[defaultScheme];
  });
  return { css: parsed.toString(), tokens };
}
