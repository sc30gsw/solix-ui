import { isBrowserOnlyGlobal, reachedFrom, type ts } from "../../../scripts/syntax";
import {
  browserOnlyRoles,
  exportedFunction,
  hasRole,
  type Library,
  located,
  type PrimitiveRule,
  publicModules,
  type Rule,
  stateCommandRole,
} from "./library";

const leftToCommandKinds = [stateCommandRole];

export function browserGlobalsReached(
  library: Library,
  roots: readonly ts.Node[],
  prune: (node: ts.Node) => boolean = () => false,
): ts.Identifier[] {
  return reachedFrom(library.compiled, roots, prune).nodes.filter((node) =>
    isBrowserOnlyGlobal(library.compiled, node),
  );
}

const browserGlobalReads: Rule = (library) => {
  const roots = publicModules(library).flatMap((module) => {
    const fn = exportedFunction(module);
    return fn ? [fn] : [];
  });
  const reads = browserGlobalsReached(
    library,
    roots,
    (node) =>
      hasRole(library, node, browserOnlyRoles) || hasRole(library, node, leftToCommandKinds),
  );
  return [...new Set(reads)].map(
    (node) =>
      `${located(node)}: ${node.text}: read a browser-only global only inside a function whose role is browser-only (${browserOnlyRoles.join(", ")}), which the server never runs.`,
  );
};

export const browserGlobalReadsRule: PrimitiveRule = {
  description:
    "what a public primitive runs on the server, through every function it reaches, reads no global declared only in lib.dom",
  rule: browserGlobalReads,
};
