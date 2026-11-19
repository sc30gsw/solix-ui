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

import { kindsWithRules, type LibraryKind } from "#/tests/support/workspace.ts";

export { loadLibrary, publicModules } from "#/tests/support/primitive-rules/library.ts";

const kindsWithEveryRule = kindsWithRules(["every"]);
const kindsWithSharedRules = kindsWithRules(["every", "shared"]);

export const primitiveRules = {
  sourceFileKinds: { ...sourceFileKindsRule, kinds: kindsWithSharedRules },
  publicExports: { ...publicExportsRule, kinds: kindsWithSharedRules },
  barrelOrder: { ...barrelOrderRule, kinds: kindsWithSharedRules },
  serverEffects: { ...serverEffectsRule, kinds: kindsWithEveryRule },
  serverBranches: { ...serverBranchesRule, kinds: kindsWithSharedRules },
  moduleState: { ...moduleStateRule, kinds: kindsWithSharedRules },
  readOnceArguments: { ...readOnceArgumentsRule, kinds: kindsWithSharedRules },
  argumentReads: { ...argumentReadsRule, kinds: kindsWithSharedRules },
  styleAndClassWrites: { ...styleAndClassWritesRule, kinds: kindsWithEveryRule },
  elementAttachments: { ...elementAttachmentsRule, kinds: kindsWithEveryRule },
  browserValues: { ...browserValuesRule, kinds: kindsWithEveryRule },
  browserValueAssertions: { ...browserValueAssertionsRule, kinds: kindsWithEveryRule },
  hydrationPolicy: { ...hydrationPolicyRule, kinds: kindsWithEveryRule },
  browserGlobalReads: { ...browserGlobalReadsRule, kinds: kindsWithSharedRules },
  commandKinds: { ...commandKindsRule, kinds: kindsWithEveryRule },
  liveOptions: { ...liveOptionsRule, kinds: kindsWithEveryRule },
  listenerRoles: { ...listenerRolesRule, kinds: kindsWithEveryRule },
  eventHandlerProperties: { ...eventHandlerPropertiesRule, kinds: kindsWithEveryRule },
  observerConstruction: { ...observerConstructionRule, kinds: kindsWithEveryRule },
  caughtErrors: { ...caughtErrorsRule, kinds: kindsWithSharedRules },
  instanceofChecks: { ...instanceofChecksRule, kinds: kindsWithSharedRules },
  focusMoves: { ...focusMovesRule, kinds: kindsWithEveryRule },
  testsNamedForModules: { ...testsNamedForModulesRule, kinds: kindsWithEveryRule },
  modelTests: { ...modelTestsRule, kinds: kindsWithEveryRule },
  accessibilityTests: { ...accessibilityTestsRule, kinds: kindsWithEveryRule },
  browserTestsUseTheHarness: { ...browserTestsUseTheHarnessRule, kinds: kindsWithEveryRule },
  browserTestWaits: { ...browserTestWaitsRule, kinds: kindsWithEveryRule },
  serverRenderTest: { ...serverRenderTestRule, kinds: kindsWithEveryRule },
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
