import ts from "typescript";
import { descendants } from "../syntax";
import { at, type PrimitiveRule, type Rule, stringsIn } from "./library";

const effectsAPrimitiveAvoids: Record<string, string> = {
  createRenderEffect:
    "runs its effect function on the server too, during the render, so a primitive would touch the DOM there",
  createTrackedEffect:
    "is deprecated: it tracks and runs its side effect in one scope, which may run more than once for one change",
};

const serverEffects: Rule = (library) =>
  library.modules.flatMap((module) =>
    descendants(module.source)
      .filter(
        (node) =>
          (ts.isIdentifier(node) && Object.hasOwn(effectsAPrimitiveAvoids, node.text)) ||
          (ts.isElementAccessExpression(node) &&
            stringsIn(library, node.argumentExpression).some((name) =>
              Object.hasOwn(effectsAPrimitiveAvoids, name),
            )),
      )
      .map((node) => {
        const name = ts.isElementAccessExpression(node)
          ? (stringsIn(library, node.argumentExpression).find((found) =>
              Object.hasOwn(effectsAPrimitiveAvoids, found),
            ) ?? "")
          : node.getText();
        return `${at(module, node)}: ${node.getText()}: ${name} ${effectsAPrimitiveAvoids[name]}. Put a primitive's side effect in the apply of a createEffect, which runs only in the browser.`;
      }),
  );

export const serverEffectsRule: PrimitiveRule = {
  description: "no primitive names createRenderEffect or createTrackedEffect",
  rule: serverEffects,
};
