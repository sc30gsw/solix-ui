import { descendants, findAncestor, parameterAliases, ts } from "#/scripts/syntax.ts";
import {
  at,
  browserOnlyRoles,
  callsTo,
  comparedByValueRoles,
  hasRole,
  type Library,
  type PrimitiveRule,
  publicModules,
  type Rule,
} from "#/tests/support/primitive-rules/library.ts";

const optionReader = { file: "internal-access.ts", name: "access" };
const configRole = "LiveConfig";

function isReadLive(library: Library, read: ts.Node): boolean {
  const enclosing = findAncestor(read.parent, ts.isSignatureDeclaration);
  return (
    findAncestor(read.parent, (ancestor) => hasRole(library, ancestor, comparedByValueRoles)) !==
      undefined ||
    (enclosing !== undefined &&
      !hasRole(library, enclosing, browserOnlyRoles) &&
      findAncestor(enclosing.parent, (ancestor) => hasRole(library, ancestor, browserOnlyRoles)) !==
        undefined)
  );
}

const liveOptions: Rule = (library) =>
  publicModules(library).flatMap((module) => {
    const nodes = descendants(module.source);
    const callsAHelper = nodes.some(
      (node) =>
        ts.isCallExpression(node) &&
        parameterAliases(library.compiled, node).some(({ name }) => name === configRole),
    );
    if (!callsAHelper) return [];
    return nodes
      .filter((node) => callsTo(library, node, optionReader) && !isReadLive(library, node))
      .map(
        (node) =>
          `${at(module, node)}: ${node.getText()}: this module calls a helper that takes a ${configRole}, so read a live option inside an argument typed ${comparedByValueRoles.join(" or ")}, which the helper compares with sameValue, or inside a function nested in a browser-only function, such as an event listener. Read once where it attaches, the option would be frozen.`,
      );
  });

export const liveOptionsRule: PrimitiveRule = {
  description: `a public primitive that calls a helper taking a ${configRole} reads its live options only inside an argument typed ${comparedByValueRoles.join(" or ")}, or inside a function nested in a browser-only function`,
  rule: liveOptions,
};
