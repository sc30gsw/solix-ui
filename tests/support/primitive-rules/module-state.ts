import { isAsConst, modifierFlags, outsideClosures, ts, unwrapped } from "#/scripts/syntax.ts";
import { at, type PrimitiveRule, type Rule } from "#/tests/support/primitive-rules/library.ts";

const callsAllowedAtModuleLevel = ["Symbol", "Object.freeze"];

function stateIn(initializer: ts.Expression): ts.Node[] {
  return outsideClosures(initializer).filter((node) => {
    if (ts.isNewExpression(node) || ts.isRegularExpressionLiteral(node)) return true;
    if (ts.isTaggedTemplateExpression(node)) return true;
    return (
      ts.isCallExpression(node) && !callsAllowedAtModuleLevel.includes(node.expression.getText())
    );
  });
}

const moduleState: Rule = (library) =>
  library.modules.flatMap((module) =>
    module.source.statements.flatMap((statement) => {
      const found: [ts.Node, string][] = [];
      if (ts.isVariableStatement(statement)) {
        if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0) {
          found.push([statement, "a module-level let or var"]);
        }
        for (const { initializer } of statement.declarationList.declarations) {
          if (!initializer) continue;
          const value = unwrapped(initializer);
          if (
            !isAsConst(initializer) &&
            (ts.isArrayLiteralExpression(value) || ts.isObjectLiteralExpression(value))
          ) {
            found.push([initializer, "a module-level array or object that is not as const"]);
          }
          for (const node of stateIn(initializer)) {
            found.push([node, `${node.getText().split("\n")[0]} at module level`]);
          }
        }
      }
      if (ts.isClassDeclaration(statement)) {
        for (const member of statement.members) {
          const isStatic =
            ts.isClassStaticBlockDeclaration(member) ||
            (modifierFlags(member) & ts.ModifierFlags.Static) !== 0;
          if (isStatic && !ts.isMethodDeclaration(member)) {
            found.push([member, "a static class field"]);
          }
        }
      }
      return found.map(
        ([node, what]) =>
          `${at(module, node)}: ${what}. Module-level state is shared by every request on the server and every instance in the browser. Keep the state inside the primitive, and write a constant as a primitive value, Symbol(...), Object.freeze(...) or a literal with as const.`,
      );
    }),
  );

export const moduleStateRule: PrimitiveRule = {
  description: "no primitive keeps state at module level",
  rule: moduleState,
};
