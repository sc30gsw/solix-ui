import { descendants, ts } from "../../../scripts/syntax";
import {
  at,
  browserTestSuffixes,
  type Declared,
  exportedFunction,
  type Library,
  type Module,
  type PrimitiveRule,
  publicModules,
  reaches,
  type Rule,
  testNamed,
} from "./library";

const valueHelper = { file: "internal-value.ts", name: "createValue" };
const scrollFold = { file: "internal-scroll.ts", name: "createScrollFold" };
const modelRun = "modelRun";
const asyncModelRun = "asyncModelRun";

function reachesHelper(library: Library, module: Module, helper: Declared): boolean {
  const fn = exportedFunction(module);
  return fn !== undefined && reaches(library, fn, helper);
}

function runsAModel(library: Library, module: Module, runner: string): boolean {
  const browserTest = testNamed(library, module.file, browserTestSuffixes);
  return (
    browserTest !== undefined &&
    descendants(browserTest).some(
      (node) =>
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === runner,
    )
  );
}

const modelTests: Rule = (library) => [
  ...publicModules(library)
    .filter((module) => reachesHelper(library, module, valueHelper))
    .filter((module) => !runsAModel(library, module, modelRun))
    .map(
      (module) =>
        `${at(module)}: it keeps its state in ${valueHelper.name}, so its browser test runs generated sequences of its commands against a model with fc.${modelRun}, built on tests/support/model.ts.`,
    ),
  ...publicModules(library)
    .filter((module) => reachesHelper(library, module, scrollFold))
    .filter((module) => !runsAModel(library, module, asyncModelRun))
    .map(
      (module) =>
        `${at(module)}: it folds scroll positions into its state with ${scrollFold.name}, so its browser test runs generated sequences of scroll positions against a model with fc.${asyncModelRun}.`,
    ),
];

export const modelTestsRule: PrimitiveRule = {
  description:
    "every primitive that keeps its state in internal-value, or folds scroll positions with createScrollFold, has a model test",
  rule: modelTests,
};
