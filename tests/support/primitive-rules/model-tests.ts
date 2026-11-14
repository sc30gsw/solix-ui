import ts from "typescript";
import { descendants } from "../syntax";
import {
  at,
  browserTestSuffixes,
  callsOneOf,
  importsFrom,
  type Library,
  type Module,
  type PrimitiveRule,
  publicModules,
  type Rule,
  testNamed,
} from "./library";

const valueModule = "./internal-value";
const scrollFold = "createScrollFold";
const modelRun = "modelRun";
const asyncModelRun = "asyncModelRun";

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
    .filter((module) => importsFrom(module, valueModule))
    .filter((module) => !runsAModel(library, module, modelRun))
    .map(
      (module) =>
        `${at(module)}: it keeps its state in ${valueModule}, so its browser test runs generated sequences of its commands against a model with fc.${modelRun}, built on tests/support/model.ts.`,
    ),
  ...publicModules(library)
    .filter((module) => callsOneOf(module, [scrollFold]))
    .filter((module) => !runsAModel(library, module, asyncModelRun))
    .map(
      (module) =>
        `${at(module)}: it folds scroll positions into its state with ${scrollFold}, so its browser test runs generated sequences of scroll positions against a model with fc.${asyncModelRun}.`,
    ),
];

export const modelTestsRule: PrimitiveRule = {
  description:
    "every primitive that keeps its state in internal-value, or folds scroll positions with createScrollFold, has a model test",
  rule: modelTests,
};
