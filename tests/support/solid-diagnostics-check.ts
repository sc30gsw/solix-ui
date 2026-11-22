import { afterEach, beforeEach, expect } from "vite-plus/test";
import {
  captureSolidDiagnostics,
  solidDevelopmentBuildLoaded,
} from "#/tests/support/browser-gates.ts";

let diagnosticsRaised: (() => string[]) | undefined;
const codesRaisedOnPurpose = new Set<string>();

export function raisesSolidDiagnosticOnPurpose(code: string): void {
  codesRaisedOnPurpose.add(code);
}

function raisedOnPurpose(diagnostic: string): boolean {
  return [...codesRaisedOnPurpose].some((code) => diagnostic.startsWith(`${code}: `));
}

beforeEach(() => {
  expect(
    solidDevelopmentBuildLoaded(),
    "the node project loads Solid's development build, whose diagnostics this check reads",
  ).toBe(true);
  codesRaisedOnPurpose.clear();
  diagnosticsRaised = captureSolidDiagnostics();
});

afterEach(() => {
  const raised = (diagnosticsRaised?.() ?? []).filter((diagnostic) => !raisedOnPurpose(diagnostic));
  diagnosticsRaised = undefined;
  codesRaisedOnPurpose.clear();
  expect(
    raised,
    "the Solid development diagnostics this test raised, in a server render or anywhere else in its body, but those whose codes it gave raisesSolidDiagnosticOnPurpose. Solid reports each kind once per process, so fix its cause before you read the next test's.",
  ).toEqual([]);
});
