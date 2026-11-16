import { ts } from "../syntax";
import { forbidOutside } from "./library";

const errorBoundary = { file: "internal-browser-value.ts", fn: "whereAllowed" };

export const caughtErrorsRule = forbidOutside({
  description: `nothing catches an error but ${errorBoundary.fn} in ${errorBoundary.file}`,
  home: errorBoundary,
  find: (_library, node) => ts.isCatchClause(node),
  advice: `nothing in the primitives package catches an error but ${errorBoundary.fn}. Find a missing browser API with lookUp or browserMethod, and let any other error reach the caller.`,
});
