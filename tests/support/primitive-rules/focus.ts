import { join, relative } from "node:path";
import { fileNamedBy } from "#/scripts/subpath.ts";
import { descendants, importsOf, nameOf, ts } from "#/scripts/syntax.ts";
import { repositoryRoot } from "#/tests/support/workspace.ts";
import {
  at,
  browserTestSuffixes,
  exportedFunction,
  forbidOutside,
  type Library,
  type PrimitiveRule,
  publicModules,
  reaches,
  refersToDomMember,
  type Rule,
  testNamed,
} from "#/tests/support/primitive-rules/library.ts";

const focusMethod = "focus";
const focusMover = { file: "internal-focus.ts", name: "moveFocus" };
const accessibilityFile = "support/accessibility.ts";
const axeAssertion = "expectNoAxeViolations";

export const focusMovesRule = forbidOutside({
  description: `nothing but ${focusMover.name} in ${focusMover.file} refers to the DOM's focus method, by any spelling refersToDomMember resolves`,
  home: { file: focusMover.file, fn: focusMover.name },
  find: (library, node) =>
    refersToDomMember(library, node, (declaration) => nameOf(declaration) === focusMethod),
  advice: `move focus with ${focusMover.name} from ${focusMover.file}, which confirms the element took it and which the accessibility rule follows.`,
});

function awaitsTheAxeAssertion(library: Library, test: ts.SourceFile): boolean {
  const accessibilityModule = join(library.testDirectory, accessibilityFile);
  const imported = importsOf(test)
    .filter(({ specifier }) => fileNamedBy(test.fileName, specifier) === accessibilityModule)
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
    .filter((module) => {
      const fn = exportedFunction(module);
      return fn !== undefined && reaches(library, fn, focusMover);
    })
    .filter((module) => {
      const browserTest = testNamed(library, module.file, browserTestSuffixes);
      return !(browserTest && awaitsTheAxeAssertion(library, browserTest));
    })
    .map(
      (module) =>
        `${at(module)}: it reaches ${focusMover.name}, so its browser test awaits ${axeAssertion} from ${relative(repositoryRoot, join(library.testDirectory, accessibilityFile))} on the region it manages.`,
    );

export const accessibilityTestsRule: PrimitiveRule = {
  description: `every public primitive that reaches ${focusMover.name}, through any function it calls, has a browser test that awaits ${axeAssertion} from packages/primitives/tests/support/accessibility.ts`,
  rule: accessibilityTests,
};
