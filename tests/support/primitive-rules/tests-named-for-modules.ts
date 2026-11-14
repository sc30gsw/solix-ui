import {
  at,
  browserTestSuffixes,
  isInternal,
  isPrimitive,
  isPublic,
  type Module,
  nodeTestSuffixes,
  type PrimitiveRule,
  type Rule,
  testNamed,
} from "./library";
import { basename } from "node:path";
import { exportsOf } from "../syntax";

function exportsAFunction(module: Module): boolean {
  return exportsOf(module.source).functions.length > 0;
}

const testsNamedForModules: Rule = (library) =>
  library.modules.flatMap((module) => {
    const stem = basename(module.file, ".ts");
    if (isPrimitive(module.file)) {
      return testNamed(library, module.file, browserTestSuffixes)
        ? []
        : [
            `${at(module)}: add a browser test, tests/${stem}${browserTestSuffixes[0]}, run in each engine with the harness in tests/support.`,
          ];
    }
    if (isPublic(module.file)) {
      return testNamed(library, module.file, nodeTestSuffixes)
        ? []
        : [
            `${at(module)}: add a Node test, tests/${stem}${nodeTestSuffixes[0]}, since a plain helper needs no browser.`,
          ];
    }
    if (!isInternal(module.file) || !exportsAFunction(module)) return [];
    return testNamed(library, module.file, [...browserTestSuffixes, ...nodeTestSuffixes])
      ? []
      : [
          `${at(module)}: it holds logic the primitives rely on, so add a test named for it: tests/${stem}${nodeTestSuffixes[0]} in Node, or tests/${stem}${browserTestSuffixes[0]} in each engine when it needs a browser.`,
        ];
  });

export const testsNamedForModulesRule: PrimitiveRule = {
  description:
    "every primitive has a browser test named for it, every plain helper a Node test, and every internal module that exports a function a test of either kind",
  rule: testsNamedForModules,
};
