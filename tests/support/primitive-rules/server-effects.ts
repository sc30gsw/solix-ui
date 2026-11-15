import { declarationsOf, isInTypePosition, stringsIn, ts } from "../syntax";
import { forbidOutside, isFromSolid } from "./library";

const effectsAPrimitiveAvoids = ["createRenderEffect", "createTrackedEffect"];

export const serverEffectsRule = forbidOutside({
  description: "no source refers to Solid's createRenderEffect or createTrackedEffect",
  find: (library, node) =>
    (ts.isIdentifier(node) &&
      !isInTypePosition(node) &&
      declarationsOf(library.compiled, node).some((declaration) =>
        isFromSolid(declaration, effectsAPrimitiveAvoids),
      )) ||
    (ts.isElementAccessExpression(node) &&
      stringsIn(library.compiled, node.argumentExpression).some((name) =>
        effectsAPrimitiveAvoids.includes(name),
      )),
  advice:
    "createRenderEffect runs on the server too, during the render, so a primitive would touch the DOM there, and createTrackedEffect may run its side effect more than once for one change. Put a primitive's side effect in the apply of a createEffect, which runs only in the browser.",
});
