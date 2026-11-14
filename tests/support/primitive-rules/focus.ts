import ts from "typescript";
import { join, relative } from "node:path";
import { descendants, importsOf } from "../syntax";
import { repositoryRoot } from "../workspace";
import {
  at,
  browserTestSuffixes,
  type Module,
  type PrimitiveRule,
  publicModules,
  reachesThrough,
  type Rule,
  testNamed,
} from "./library";

const focusMethod = "focus";

const focusMover = "moveFocus";

const focusModule = "internal-focus.ts";

const accessibilityModule = "./support/accessibility";

const axeAssertion = "expectNoAxeViolations";

function declaresTheFocusMover(module: Module): boolean {
  return (
    module.file === focusModule &&
    module.source.statements.some(
      (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === focusMover,
    )
  );
}

const focusMovesThroughOneFunction: Rule = (library) =>
  library.modules.flatMap((module) =>
    descendants(module.source)
      .filter(
        (node): node is ts.CallExpression =>
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === focusMethod,
      )
      .filter((call) => {
        const owner = ts.findAncestor(call, ts.isFunctionDeclaration);
        return !(declaresTheFocusMover(module) && owner?.name?.text === focusMover);
      })
      .map(
        (call) =>
          `${at(module, call)}: ${call.getText()}: move focus with ${focusMover} from ${focusModule}, which confirms the element took it and which the accessibility rule follows.`,
      ),
  );

function awaitsTheAxeAssertion(test: ts.SourceFile): boolean {
  const imported = importsOf(test)
    .filter(({ specifier }) => specifier === accessibilityModule)
    .flatMap(({ names }) => names)
    .filter(({ imported: name }) => name === axeAssertion)
    .map(({ local }) => local);
  return descendants(test).some(
    (node) =>
      ts.isAwaitExpression(node) &&
      ts.isCallExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      imported.includes(node.expression.expression.text),
  );
}

const accessibilityTests: Rule = (library) =>
  publicModules(library)
    .filter((module) => reachesThrough(library, module, declaresTheFocusMover))
    .filter((module) => {
      const browserTest = testNamed(library, module.file, browserTestSuffixes);
      return !(browserTest && awaitsTheAxeAssertion(browserTest));
    })
    .map(
      (module) =>
        `${at(module)}: it reaches ${focusMover} through the modules it imports, so its browser test awaits ${axeAssertion} from ${relative(repositoryRoot, join(library.testDirectory, `${accessibilityModule}.ts`))} on the region it manages.`,
    );

export const focusMovesRule: PrimitiveRule = {
  description: "every focus move goes through moveFocus in internal-focus.ts",
  rule: focusMovesThroughOneFunction,
};

export const accessibilityTestsRule: PrimitiveRule = {
  description:
    "every public module that reaches moveFocus, through any module it imports, has a browser test that awaits expectNoAxeViolations from packages/primitives/tests/support/accessibility.ts",
  rule: accessibilityTests,
};
