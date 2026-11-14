import ts from "typescript";
import { descendants } from "../syntax";
import {
  at,
  browserTestSuffixes,
  importsFrom,
  type Library,
  type Module,
  type PrimitiveRule,
  publicModules,
  type Rule,
  testNamed,
} from "./library";

const valueModule = "./internal-value";
const modelRun = "modelRun";

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

const modelTests: Rule = (library) =>
  publicModules(library)
    .filter((module) => importsFrom(module, valueModule))
    .filter((module) => !runsAModel(library, module, modelRun))
    .map(
      (module) =>
        `${at(module)}: it keeps its state in ${valueModule}, so its browser test runs generated sequences of its commands against a model with fc.${modelRun}, built on tests/support/model.ts.`,
    );

export const modelTestsRule: PrimitiveRule = {
  description: "every primitive that keeps its state in internal-value has a model test",
  rule: modelTests,
};
