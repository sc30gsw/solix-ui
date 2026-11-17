import type postcss from "postcss";
import { STYLE_PROP_LAYER } from "#/build-pipeline.mjs";
import { childRuleLayer } from "#/src/style-prop-table.ts";

function isAtRule(node: postcss.Node | postcss.Document | undefined): node is postcss.AtRule {
  return node?.type === "atrule";
}

export function enclosingAtRules(node: postcss.Node): postcss.AtRule[] {
  const parent = node.parent;
  if (!isAtRule(parent)) return [];
  return [parent, ...enclosingAtRules(parent)];
}

export function layersAroundDeclaration(declaration: postcss.Declaration): string[] {
  const rule = declaration.parent;
  return rule === undefined
    ? []
    : enclosingAtRules(rule)
        .filter(({ name }) => name === "layer")
        .map(({ params }) => params);
}

export function inStylePropLayer(node: postcss.Node): boolean {
  return enclosingAtRules(node).some(
    ({ name, params }) => name === "layer" && params === STYLE_PROP_LAYER,
  );
}

export function inChildRuleLayer(node: postcss.Node): boolean {
  return enclosingAtRules(node).some(
    ({ name, params }) => name === "layer" && params === childRuleLayer,
  );
}

export function nestedLayerOrder(layer: postcss.Container): string[] {
  const order: string[] = [];
  layer.each((node) => {
    if (node.type !== "atrule" || node.name !== "layer") return;
    for (const name of node.params.split(",").map((part) => part.trim())) {
      if (!order.includes(name)) order.push(name);
    }
  });
  return order;
}
