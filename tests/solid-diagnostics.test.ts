import { beforeAll, expect, test } from "vite-plus/test";
import {
  describeSolidDiagnostic,
  expectingSolidDiagnostic,
  isCoveredBy,
  problemsPrinted,
} from "#/tests/support/solid-diagnostics.ts";

const outsideATest: { thrown?: unknown } = {};

beforeAll(() => {
  try {
    expectingSolidDiagnostic("SERVER_WRITE", () => undefined);
  } catch (error) {
    outsideATest.thrown = error;
  }
});

test("a report printed by Solid's development build is read with its owner, apart from the lines around it, and a line of the same code that is not one of Solid's footers starts a new report", () => {
  const printed = [
    "10:09:33 PM [vite+] (ssr) connected.",
    "[SERVER_WRITE] Writing a signal on the server is deprecated.",
    "  in <App> › <Grid.Col>",
    "  at ../../packages/core/dist/GridCol.jsx:68:7",
    "[SERVER_WRITE] what it means and how to fix it: https://docs.solidjs.com",
    "[SERVER_WRITE] agent repair guide: node_modules/solid-js/skills/reactivity-diagnostics/SKILL.md",
    "[SERVER_WRITE] Writing a store on the server is deprecated.",
    "[HOT_SCOPE_RERUNS] deeper evidence: import { attribution } from solid-js/attribution",
    "Error: [REACTIVITY_HALTED] The reactive system halted.",
    "    at flush (solid.js:10:1)",
    "warning: probe",
    "  ➜  Network: use --host to expose",
  ].join("\n");

  expect(problemsPrinted(printed)).toEqual({
    diagnostics: [
      {
        code: "SERVER_WRITE",
        message: "Writing a signal on the server is deprecated.",
        owner: "<App> › <Grid.Col>",
      },
      { code: "SERVER_WRITE", message: "Writing a store on the server is deprecated." },
      { code: "REACTIVITY_HALTED", message: "The reactive system halted." },
    ],
    otherLines: [
      "10:09:33 PM [vite+] (ssr) connected.",
      "warning: probe",
      "  ➜  Network: use --host to expose",
    ],
  });
});

test("an upstream exception covers a diagnostic of its code reported under the owner it names, and no other", () => {
  const exception = {
    code: "SERVER_WRITE",
    reportedUnder: "<Grid.Col>",
    package: "a package",
    reachedThrough: "a dependency",
    reason: "a reason",
    expires: "2999-01-01",
  } as const;

  expect(
    isCoveredBy(exception, { code: "SERVER_WRITE", message: "m", owner: "<App> › <Grid.Col>" }),
  ).toBe(true);
  expect(isCoveredBy(exception, { code: "SERVER_WRITE", message: "<Grid.Col>" })).toBe(false);
  expect(
    isCoveredBy(exception, { code: "NO_OWNER_EFFECT", message: "m", owner: "<Grid.Col>" }),
  ).toBe(false);
});

test("a diagnostic is described by its code, the first line of its message and its owner", () => {
  expect(
    describeSolidDiagnostic({ code: "SERVER_WRITE", message: "Written.", owner: "<Box>" }),
  ).toBe("SERVER_WRITE: Written. (in <Box>)");
});

test("an allowance made while no test holds the gate throws, and one whose code raised nothing fails", () => {
  expect(String(outsideATest.thrown)).toContain("while no test held Solid's diagnostics gate");
  expect(() => expectingSolidDiagnostic("SERVER_WRITE", () => undefined)).toThrow(
    "raised no SERVER_WRITE",
  );
});
