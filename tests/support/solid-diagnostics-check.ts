import { afterAll, afterEach, beforeEach, expect, onTestFinished } from "vite-plus/test";
import {
  openSolidDiagnosticsGate,
  type SolidDiagnosticsGate,
  solidDevelopmentBuildLoaded,
} from "#/tests/support/solid-diagnostics.ts";

const outsideTests: { gate: SolidDiagnosticsGate } = {
  gate: openSolidDiagnosticsGate(),
};
const testGates = new WeakMap<object, SolidDiagnosticsGate>();

function finishTheTestsGate(task: object): string[] | undefined {
  const gate = testGates.get(task);
  if (gate === undefined) return undefined;
  testGates.delete(task);
  const raised = gate.finishDescribed();
  outsideTests.gate = openSolidDiagnosticsGate();
  return raised;
}

const inTestMessage =
  "the Solid development diagnostics this test raised, in a server render or anywhere else in its body, but those it ran inside expectingSolidDiagnostic";

beforeEach((context) => {
  const raisedOutsideTests = outsideTests.gate.finishDescribed();
  const gate = openSolidDiagnosticsGate({ exclusive: true });
  testGates.set(context.task, gate);
  onTestFinished(() => {
    const raised = finishTheTestsGate(context.task);
    if (raised !== undefined) expect.soft(raised, inTestMessage).toEqual([]);
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

afterEach((context) => {
  const raised = finishTheTestsGate(context.task);
  if (raised !== undefined) expect.soft(raised, inTestMessage).toEqual([]);
});

afterAll(() => {
  expect(
    outsideTests.gate.finishDescribed(),
    "the Solid development diagnostics raised after the file's last test",
  ).toEqual([]);
});
