import { createComponent, renderToString } from "@solidjs/web";
import { createSignal, Errored } from "solid-js";
import { beforeAll, expect, test } from "vite-plus/test";
import {
  describeSolidDiagnostic,
  expectingSolidDiagnostic,
  isCoveredBy,
  openSolidDiagnosticsGate,
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

test("a report printed by Solid's development build is read with its owner, apart from the lines around it, a line of the same code that is not one of Solid's footers starts a new report, and an indented line after a footer stays in otherLines", () => {
  const printed = [
    "10:09:33 PM [vite+] (ssr) connected.",
    "[SERVER_WRITE] Writing a signal on the server is deprecated.",
    "  in <App> › <Grid.Col>",
    "  at ../../packages/core/dist/GridCol.jsx:68:7",
    "[SERVER_WRITE] what it means and how to fix it: https://docs.solidjs.com",
    "  indented detail after footer",
    "[SERVER_WRITE] agent repair guide: node_modules/solid-js/skills/reactivity-diagnostics/SKILL.md",
    "[SERVER_WRITE] Writing a store on the server is deprecated.",
    "[HOT_SCOPE_RERUNS] deeper evidence: import { attribution } from solid-js/attribution",
    "  ➜  Network: use --host to expose",
    "Error: [REACTIVITY_HALTED] The reactive system halted.",
    "    at flush (solid.js:10:1)",
    "warning: probe",
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
      "  indented detail after footer",
      "  ➜  Network: use --host to expose",
      "warning: probe",
    ],
  });
});

test("an upstream exception covers a diagnostic of its code reported under the non-empty owner it names, and no other", () => {
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
  expect(
    isCoveredBy(
      { ...exception, reportedUnder: "" },
      { code: "SERVER_WRITE", message: "m", owner: "<Grid.Col>" },
    ),
  ).toBe(false);
});

test("a diagnostic is described by its code, the first line of its message and its owner", () => {
  expect(
    describeSolidDiagnostic({ code: "SERVER_WRITE", message: "Written.", owner: "<Box>" }),
  ).toBe("SERVER_WRITE: Written. (in <Box>)");
});

test("an allowance made while no test holds the gate throws, one whose code raised nothing fails, and an async callback is refused", () => {
  expect(String(outsideATest.thrown)).toContain("while no test held Solid's diagnostics gate");
  expect(() => expectingSolidDiagnostic("SERVER_WRITE", () => undefined)).toThrow(
    "raised no SERVER_WRITE",
  );
  expect(() =>
    expectingSolidDiagnostic("SERVER_WRITE", (() => Promise.resolve()) as unknown as () => void),
  ).toThrow("synchronous");
});

test("expectingSolidDiagnostic allows only the code it names inside its callback, leaving other codes reported to the outer gate, and finish is idempotent", () => {
  const { captured, secondFinish } = expectingSolidDiagnostic("SSR_RENDER_ERROR_CONTAINED", () => {
    const outer = openSolidDiagnosticsGate();
    expectingSolidDiagnostic("SERVER_WRITE", () => {
      renderToString(() => {
        const [, setWritten] = createSignal(false);
        setWritten(true);
        return createComponent(Errored, {
          fallback: () => "fallback",
          get children(): string {
            throw new Error("contained");
          },
        });
      });
    });
    return { captured: outer.finish(), secondFinish: outer.finish() };
  });

  expect(captured.map(({ code }) => code)).toEqual(["SSR_RENDER_ERROR_CONTAINED"]);
  expect(secondFinish).toEqual([]);
});

test("a test gate opened while another test's gate is open is refused, and a gate that is not a test's opens beside it", () => {
  expect(() => openSolidDiagnosticsGate({ exclusive: true })).toThrow(
    "while another test's gate was open",
  );
  expect(openSolidDiagnosticsGate().finish()).toEqual([]);
});

function renderAContainedError(): void {
  renderToString(() =>
    createComponent(Errored, {
      fallback: () => "fallback",
      get children(): string {
        throw new Error("contained");
      },
    }),
  );
}

test("rotate gives what the gate caught and reopens it, so a diagnostic raised after it is caught by the next rotate or finish, and a finished gate reopens", () => {
  const caught = expectingSolidDiagnostic("SSR_RENDER_ERROR_CONTAINED", () => {
    const gate = openSolidDiagnosticsGate();
    renderAContainedError();
    const first = gate.rotate();
    renderAContainedError();
    const second = gate.rotate();
    const quiet = gate.finish();
    const afterFinish = gate.rotate();
    renderAContainedError();
    const reopened = gate.finish();
    return [first, second, quiet, afterFinish, reopened].map((raised) =>
      raised.map(({ code }) => code),
    );
  });

  expect(caught).toEqual([
    ["SSR_RENDER_ERROR_CONTAINED"],
    ["SSR_RENDER_ERROR_CONTAINED"],
    [],
    [],
    ["SSR_RENDER_ERROR_CONTAINED"],
  ]);
});

test("reopen opens a finished gate again, so it catches what is raised after it, and refuses a gate that is still open, and rotateDescribed describes what it caught as finishDescribed does", () => {
  const caught = expectingSolidDiagnostic("SSR_RENDER_ERROR_CONTAINED", () => {
    const gate = openSolidDiagnosticsGate();
    const quiet = gate.finishDescribed();
    renderAContainedError();
    gate.reopen();
    renderAContainedError();
    const described = gate.rotateDescribed();
    let refused: unknown;
    try {
      gate.reopen();
    } catch (error) {
      refused = error;
    }
    renderAContainedError();
    const last = gate.finishDescribed();
    return { quiet, described, refused, last };
  });

  expect(caught.quiet).toEqual([]);
  expect(caught.described).toHaveLength(1);
  expect(caught.described[0]).toMatch(/^SSR_RENDER_ERROR_CONTAINED: /);
  expect(caught.last).toEqual(caught.described);
  expect(String(caught.refused)).toContain("still open");
});
