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
import { type KindRule } from "#/tests/support/primitive-rules/library.ts";
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

const primitivesOnly: readonly LibraryKind[] = ["primitives"];
const primitivesAndLogic: readonly LibraryKind[] = ["primitives", "logic"];

export const primitiveRules = {
  sourceFileKinds: { ...sourceFileKindsRule, kinds: primitivesAndLogic },
  publicExports: { ...publicExportsRule, kinds: primitivesAndLogic },
  barrelOrder: { ...barrelOrderRule, kinds: primitivesAndLogic },
  serverEffects: { ...serverEffectsRule, kinds: primitivesOnly },
  serverBranches: { ...serverBranchesRule, kinds: primitivesAndLogic },
  moduleState: { ...moduleStateRule, kinds: primitivesAndLogic },
  readOnceArguments: { ...readOnceArgumentsRule, kinds: primitivesAndLogic },
  argumentReads: { ...argumentReadsRule, kinds: primitivesAndLogic },
  styleAndClassWrites: { ...styleAndClassWritesRule, kinds: primitivesOnly },
  elementAttachments: { ...elementAttachmentsRule, kinds: primitivesOnly },
  browserValues: { ...browserValuesRule, kinds: primitivesOnly },
  browserValueAssertions: { ...browserValueAssertionsRule, kinds: primitivesOnly },
  hydrationPolicy: { ...hydrationPolicyRule, kinds: primitivesOnly },
  browserGlobalReads: { ...browserGlobalReadsRule, kinds: primitivesAndLogic },
  commandKinds: { ...commandKindsRule, kinds: primitivesOnly },
  liveOptions: { ...liveOptionsRule, kinds: primitivesOnly },
  listenerRoles: { ...listenerRolesRule, kinds: primitivesOnly },
  eventHandlerProperties: { ...eventHandlerPropertiesRule, kinds: primitivesOnly },
  observerConstruction: { ...observerConstructionRule, kinds: primitivesOnly },
  caughtErrors: { ...caughtErrorsRule, kinds: primitivesAndLogic },
  instanceofChecks: { ...instanceofChecksRule, kinds: primitivesAndLogic },
  focusMoves: { ...focusMovesRule, kinds: primitivesOnly },
  testsNamedForModules: { ...testsNamedForModulesRule, kinds: primitivesOnly },
  modelTests: { ...modelTestsRule, kinds: primitivesOnly },
  accessibilityTests: { ...accessibilityTestsRule, kinds: primitivesOnly },
  browserTestsUseTheHarness: { ...browserTestsUseTheHarnessRule, kinds: primitivesOnly },
  browserTestWaits: { ...browserTestWaitsRule, kinds: primitivesOnly },
  serverRenderTest: { ...serverRenderTestRule, kinds: primitivesOnly },
} satisfies Record<string, KindRule>;

export type PrimitiveRuleName = keyof typeof primitiveRules;

function isRuleName(name: string): name is PrimitiveRuleName {
  return name in primitiveRules;
}

export function rulesOfKind(kind: LibraryKind): PrimitiveRuleName[] {
  return Object.keys(primitiveRules)
    .filter(isRuleName)
    .filter((name) => primitiveRules[name].kinds.includes(kind));
}
