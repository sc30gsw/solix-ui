import { ts } from "../../../scripts/syntax";
import { forbidOutside } from "./library";

export const instanceofChecksRule = forbidOutside({
  description: "no source uses instanceof",
  find: (_library, node) =>
    ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword,
  advice:
    "a class from this window does not match a node or event from a frame's. Tell nodes and events apart with the checks in internal-node.ts.",
});
