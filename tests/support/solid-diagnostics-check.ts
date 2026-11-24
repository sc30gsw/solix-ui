import { afterAll, afterEach, beforeEach, expect, onTestFinished } from "vite-plus/test";
import {
  describeSolidDiagnostic,
  openSolidDiagnosticsGate,
  openSolidDiagnosticsGateForOneTest,
  type SolidDiagnosticsGate,
  solidDevelopmentBuildLoaded,
} from "#/tests/support/solid-diagnostics.ts";

const gates: { outsideTests: SolidDiagnosticsGate; test?: SolidDiagnosticsGate } = {
  outsideTests: openSolidDiagnosticsGate(),
};

function finishTheTestsGate(): string[] {
  const raised = gates.test?.finish() ?? [];
  gates.test = undefined;
  gates.outsideTests = openSolidDiagnosticsGate();
  return raised.map(describeSolidDiagnostic);
}

beforeEach(() => {
  const raisedOutsideTests = gates.outsideTests.finish().map(describeSolidDiagnostic);
  gates.test = openSolidDiagnosticsGateForOneTest();
  onTestFinished(() => {
    if (gates.test !== undefined) finishTheTestsGate();
  });
  expect(
    solidDevelopmentBuildLoaded(),
    "the node project loads Solid's development build, whose diagnostics this check reads",
  ).toBe(true);
  expect(
    raisedOutsideTests,
    "the Solid development diagnostics raised outside a test since the last one ended: at the top level of the test file or in a hook outside the test",
  ).toEqual([]);
});

afterEach(() => {
  expect
    .soft(
      finishTheTestsGate(),
      "the Solid development diagnostics this test raised, in a server render or anywhere else in its body, but those it ran inside expectingSolidDiagnostic",
    )
    .toEqual([]);
});

afterAll(() => {
  expect(
    gates.outsideTests.finish().map(describeSolidDiagnostic),
    "the Solid development diagnostics raised after the file's last test",
  ).toEqual([]);
});
