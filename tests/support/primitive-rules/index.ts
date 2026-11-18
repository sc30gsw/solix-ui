import {
  argumentReadsRule,
  readOnceArgumentsRule,
} from "#/tests/support/primitive-rules/arguments.ts";
import { barrelOrderRule } from "#/tests/support/primitive-rules/barrel-order.ts";
import { browserGlobalReadsRule } from "#/tests/support/primitive-rules/browser-global-reads.ts";
import { browserTestWaitsRule } from "#/tests/support/primitive-rules/browser-test-waits.ts";
import { browserTestsUseTheHarnessRule } from "#/tests/support/primitive-rules/browser-tests-use-the-harness.ts";
import {
  browserValueAssertionsRule,
  browserValuesRule,
} from "#/tests/support/primitive-rules/browser-values.ts";
import { caughtErrorsRule } from "#/tests/support/primitive-rules/caught-errors.ts";
import { commandKindsRule } from "#/tests/support/primitive-rules/command-kinds.ts";
import { elementAttachmentsRule } from "#/tests/support/primitive-rules/element-attachments.ts";
import { accessibilityTestsRule, focusMovesRule } from "#/tests/support/primitive-rules/focus.ts";
import { hydrationPolicyRule } from "#/tests/support/primitive-rules/hydration-policy.ts";
import { instanceofChecksRule } from "#/tests/support/primitive-rules/instanceof-checks.ts";
import { type PrimitiveRule } from "#/tests/support/primitive-rules/library.ts";
import {
  eventHandlerPropertiesRule,
  listenerRolesRule,
} from "#/tests/support/primitive-rules/listener-roles.ts";
import { liveOptionsRule } from "#/tests/support/primitive-rules/live-options.ts";
import { modelTestsRule } from "#/tests/support/primitive-rules/model-tests.ts";
import { moduleStateRule } from "#/tests/support/primitive-rules/module-state.ts";
import { observerConstructionRule } from "#/tests/support/primitive-rules/observer-construction.ts";
import { publicExportsRule } from "#/tests/support/primitive-rules/public-exports.ts";
import { serverBranchesRule } from "#/tests/support/primitive-rules/server-branches.ts";
import { serverEffectsRule } from "#/tests/support/primitive-rules/server-effects.ts";
import { serverRenderTestRule } from "#/tests/support/primitive-rules/server-render-test.ts";
import { sourceFileKindsRule } from "#/tests/support/primitive-rules/source-file-kinds.ts";
import { styleAndClassWritesRule } from "#/tests/support/primitive-rules/style-and-class-writes.ts";
import { testsNamedForModulesRule } from "#/tests/support/primitive-rules/tests-named-for-modules.ts";

import { type LibraryKind } from "#/tests/support/workspace.ts";

export { loadLibrary, publicModules } from "#/tests/support/primitive-rules/library.ts";

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
  browserValues: browserValuesRule,
  browserValueAssertions: browserValueAssertionsRule,
  hydrationPolicy: hydrationPolicyRule,
  browserGlobalReads: browserGlobalReadsRule,
  commandKinds: commandKindsRule,
  liveOptions: liveOptionsRule,
  listenerRoles: listenerRolesRule,
  eventHandlerProperties: eventHandlerPropertiesRule,
  observerConstruction: observerConstructionRule,
  caughtErrors: caughtErrorsRule,
  instanceofChecks: instanceofChecksRule,
  focusMoves: focusMovesRule,
  testsNamedForModules: testsNamedForModulesRule,
  modelTests: modelTestsRule,
  accessibilityTests: accessibilityTestsRule,
  browserTestsUseTheHarness: browserTestsUseTheHarnessRule,
  browserTestWaits: browserTestWaitsRule,
  serverRenderTest: serverRenderTestRule,
} satisfies Record<string, PrimitiveRule>;

export type PrimitiveRuleName = keyof typeof primitiveRules;

const sharedWithLogicLibraries: readonly PrimitiveRuleName[] = [
  "sourceFileKinds",
  "publicExports",
  "barrelOrder",
  "serverBranches",
  "moduleState",
  "readOnceArguments",
  "argumentReads",
  "browserGlobalReads",
  "caughtErrors",
  "instanceofChecks",
];

export const rulesOfKind: Readonly<Record<LibraryKind, readonly PrimitiveRuleName[]>> = {
  primitives: Object.keys(primitiveRules).filter(
    (name): name is PrimitiveRuleName => name in primitiveRules,
  ),
  logic: sharedWithLogicLibraries,
  components: [],
};
