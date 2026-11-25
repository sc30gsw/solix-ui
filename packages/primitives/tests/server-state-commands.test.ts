import { expect, test } from "vite-plus/test";
import {
  type Primitive,
  serverCases,
  serverPrimitives,
  startCase,
} from "#/fixtures/server-cases.ts";
import { library } from "#/tests/built-library.ts";
import { browserResourcesReadDuring, renderedOnTheServer } from "#/tests/support/server-harness.ts";
import { expectingSolidDiagnostic } from "../../../tests/support/solid-diagnostics.ts";

const withStateCommands = serverPrimitives.filter((name) => serverCases[name].has.stateCommands);

function browserResourcesReadByItsStateCommand(name: Primitive): string[] {
  return browserResourcesReadDuring(() => {
    renderedOnTheServer(() => {
      startCase(name, library).stateCommands?.run();
      return name;
    });
  });
}

test("every state command, called inside a server render, reads none of the browser resources, and writes the signal it writes there, which Solid reports as SERVER_WRITE", () => {
  expect(withStateCommands.length).toBeGreaterThan(0);

  const read = expectingSolidDiagnostic("SERVER_WRITE", () =>
    withStateCommands.map((name) => [name, browserResourcesReadByItsStateCommand(name)]),
  );

  expect(read.filter(([, touched]) => touched.length > 0)).toEqual([]);
});
