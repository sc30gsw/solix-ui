import { join } from "node:path";
import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { browserType, enginesToVerify } from "../../../scripts/browser-engines.mjs";
import { installedVp } from "../../../scripts/repository";
import {
  type PrintedLine,
  type RunningServer,
  startServer,
  viteOnAFreePort,
} from "../../../tests/support/server-process";
import {
  isCoveredBy,
  problemsPrinted,
  type SolidDiagnostic,
  unexpectedDiagnostics,
} from "../../../tests/support/solid-diagnostics.ts";
import { upstreamExceptions } from "../../../tests/support/upstream-diagnostic-exceptions.ts";
import { diagnosticProbeMessage, diagnosticProbeParameter } from "#/src/diagnostic-probe.tsx";
import { opened } from "#/tests/support/opening.ts";
import { account, optional, panelOf, tabNamed, tabNames } from "#/tests/support/tabs.ts";

const { overview, security } = tabNames.account;
const { notes } = tabNames.optional;

const appDirectory = join(import.meta.dirname, "..");

const server: { running?: RunningServer } = {};
const reportedInEveryEngine: SolidDiagnostic[] = [];

function runningServer(): RunningServer {
  if (server.running === undefined) throw new Error("The development server did not start.");
  return server.running;
}

function unexpectedIn(text: string): string[] {
  const { diagnostics, otherLines } = problemsPrinted(text);
  return [...unexpectedDiagnostics(diagnostics), ...otherLines];
}

function isTheProbe(diagnostic: SolidDiagnostic): boolean {
  return (
    diagnostic.code === "SSR_RENDER_ERROR_CONTAINED" &&
    diagnostic.message.includes(diagnosticProbeMessage)
  );
}

function printedAfterTheAddress(stream: PrintedLine["stream"]): string {
  const running = runningServer();
  const lines = running.printedLines();
  const announced = lines.findIndex(({ text }) => text.includes(running.url));
  if (announced === -1) {
    throw new Error(`The development server did not print its address ${running.url}.`);
  }
  return lines
    .slice(announced + 1)
    .filter((line) => line.stream === stream)
    .map(({ text }) => text)
    .join("\n");
}

type ServerProblems = {
  readonly stderrDiagnostics: readonly SolidDiagnostic[];
  readonly diagnostics: readonly SolidDiagnostic[];
  readonly otherErrors: readonly string[];
};

const printed: { problems?: ServerProblems } = {};

function readServerProblems(): ServerProblems {
  const stderr = problemsPrinted(printedAfterTheAddress("stderr"));
  const stdout = problemsPrinted(printedAfterTheAddress("stdout"));
  return {
    stderrDiagnostics: stderr.diagnostics,
    diagnostics: [...stderr.diagnostics, ...stdout.diagnostics].filter(
      (diagnostic) => !isTheProbe(diagnostic),
    ),
    otherErrors: stderr.otherLines,
  };
}

function serverProblems(): ServerProblems {
  if (printed.problems === undefined) {
    throw new Error("What the development server printed is read only once it has stopped.");
  }
  return printed.problems;
}

beforeAll(async () => {
  server.running = await startServer({
    directory: appDirectory,
    command: [installedVp, "dev", "--force", ...viteOnAFreePort],
    environment: { NODE_ENV: "development" },
  });
});

afterAll(async () => {
  await server.running?.stop();
});

describe.each(enginesToVerify())("in %s", (engine) => {
  let browser: Browser;
  const reported: string[] = [];

  beforeAll(async () => {
    browser = await browserType(engine).launch();
    const page = await browser.newPage();
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        reported.push(message.text());
      }
    });
    page.on("pageerror", (error) => reported.push(String(error)));

    await opened(page, runningServer().url, "hydrated");
    const summary = page.locator("summary").filter({ hasText: "Toggle" });
    const content = page.getByText("Hidden content");
    await summary.click();
    await content.waitFor({ state: "visible" });
    await summary.click();
    await content.waitFor({ state: "hidden" });

    const dialog = page.getByRole("dialog", { name: "Settings" });
    await page.getByRole("button", { name: "Open modal" }).click();
    await dialog.waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await page.getByRole("textbox", { name: "Email" }).fill("someone@example.com");
    await page.getByText("A region that counts presses outside it").click();
    await page.getByRole("heading", { name: "Primitives" }).click();
    await tabNamed(page, account, security).click();
    await page.keyboard.press("ArrowRight");
    await page.getByText(panelOf(overview)).waitFor({ state: "visible" });
    await tabNamed(page, optional, notes).click();
    await page.getByText(panelOf(notes)).waitFor({ state: "visible" });
  });

  afterAll(async () => {
    await browser.close();
    reportedInEveryEngine.push(...reported.flatMap((text) => problemsPrinted(text).diagnostics));
  });

  test("the page reports no console error or warning, nor a diagnostic of Solid's development build from our own code", () => {
    expect(reported.flatMap(unexpectedIn)).toEqual([]);
  });
});

describe("the development server", () => {
  beforeAll(async () => {
    const running = runningServer();
    const page = await fetch(running.url);
    expect(page.ok, `fetching ${running.url} answered ${page.status}`).toBe(true);
    await page.text();
    const probe = await fetch(`${running.url}?${diagnosticProbeParameter}`);
    expect(probe.ok, `fetching the diagnostic probe answered ${probe.status}`).toBe(true);
    await probe.text();
    await running.stop();
    printed.problems = readServerProblems();
  });

  test("prints its address, and the report Solid's development build makes of the diagnostic probe, so what it printed is read and its render runs that build", () => {
    const { stderrDiagnostics } = serverProblems();

    expect(stderrDiagnostics.filter(isTheProbe)).toHaveLength(1);
  });

  test("prints no error, warning or diagnostic of Solid's from our own code while it renders the page", () => {
    const { diagnostics, otherErrors } = serverProblems();

    expect([...unexpectedDiagnostics(diagnostics), ...otherErrors]).toEqual([]);
  });
});

test("every upstream exception still describes a diagnostic that is reported, in a browser or by the development server", () => {
  const reported = [...reportedInEveryEngine, ...serverProblems().diagnostics];

  expect(
    upstreamExceptions.filter(
      (exception) => !reported.some((diagnostic) => isCoveredBy(exception, diagnostic)),
    ),
  ).toEqual([]);
});

test("no upstream exception is past its expiry date", () => {
  const today = new Date().toISOString().slice(0, 10);

  expect(upstreamExceptions.filter((exception) => exception.expires < today)).toEqual([]);
});
