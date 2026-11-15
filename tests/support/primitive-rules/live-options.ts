import { descendants, parameterAliases, ts } from "../syntax";
import {
  at,
  callsTo,
  comparedByValueRoles,
  hasRole,
  type PrimitiveRule,
  publicModules,
  type Rule,
} from "./library";

const optionReader = { file: "internal-access.ts", name: "access" };
const configRole = "LiveConfig";

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
      .filter((node) => callsTo(library, node, optionReader))
      .filter(
        (node) =>
          !ts.findAncestor(node.parent, (ancestor) =>
            hasRole(library, ancestor, comparedByValueRoles),
          ),
      )
      .map(
        (node) =>
          `${at(module, node)}: ${node.getText()}: this module gives a helper a ${configRole}, so read a live option only inside an argument typed ${comparedByValueRoles.join(" or ")}, which the helper compares with sameValue, so an option that recomputes to an equal value keeps what is built on it.`,
      );
  });

export const liveOptionsRule: PrimitiveRule = {
  description: `a public primitive that calls a helper taking a ${configRole} reads its live options only inside an argument typed ${comparedByValueRoles.join(" or ")}`,
  rule: liveOptions,
};
