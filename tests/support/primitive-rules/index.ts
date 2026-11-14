import { argumentReadsRule, readOnceArgumentsRule } from "./arguments";
import { barrelOrderRule } from "./barrel-order";
import { browserTestsUseTheHarnessRule } from "./browser-tests-use-the-harness";
import { elementAttachmentsRule } from "./element-attachments";
import { accessibilityTestsRule, focusMovesRule } from "./focus";
import { instanceofChecksRule } from "./instanceof-checks";
import { type Library, type PrimitiveRule, publicModules } from "./library";
import { modelTestsRule } from "./model-tests";
import { moduleStateRule } from "./module-state";
import { publicExportsRule } from "./public-exports";
import { serverBranchesRule } from "./server-branches";
import { serverEffectsRule } from "./server-effects";
import { serverRenderTestRule } from "./server-render-test";
import { sourceFileKindsRule } from "./source-file-kinds";
import { styleAndClassWritesRule } from "./style-and-class-writes";
import { testsNamedForModulesRule } from "./tests-named-for-modules";

export { loadLibrary } from "./library";

export const primitiveRules = {
  sourceFileKinds: sourceFileKindsRule,
  publicExports: publicExportsRule,
  barrelOrder: barrelOrderRule,
  serverEffects: serverEffectsRule,
  serverBranches: serverBranchesRule,
  moduleState: moduleStateRule,
  readOnceArguments: readOnceArgumentsRule,
  argumentReads: argumentReadsRule,
  styleAndClassWrites: styleAndClassWritesRule,
  elementAttachments: elementAttachmentsRule,
  instanceofChecks: instanceofChecksRule,
  focusMoves: focusMovesRule,
  testsNamedForModules: testsNamedForModulesRule,
  modelTests: modelTestsRule,
  accessibilityTests: accessibilityTestsRule,
  browserTestsUseTheHarness: browserTestsUseTheHarnessRule,
  serverRenderTest: serverRenderTestRule,
} satisfies Record<string, PrimitiveRule>;

export type PrimitiveRuleName = keyof typeof primitiveRules;

export function publicModuleCount(library: Library): number {
  return publicModules(library).length;
}
