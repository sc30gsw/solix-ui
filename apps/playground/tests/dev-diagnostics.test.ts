import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { browserType, enginesToVerify } from "../../../scripts/browser-engines.mjs";
import { installedVp } from "../../../scripts/repository";
import {
  type RunningServer,
  startServer,
  viteOnAFreePort,
} from "../../../tests/support/server-process";
import { opened } from "#/tests/support/opening.ts";
import { account, optional, panelOf, tabNamed, tabNames } from "#/tests/support/tabs.ts";

const { overview, security } = tabNames.account;
const { notes } = tabNames.optional;

const appDirectory = join(import.meta.dirname, "..");

type UpstreamException = {
  code: string;
  reportedUnder: string;
  package: string;
  reachedThrough: string;
  reason: string;
  expires: string;
};

const upstreamExceptions = JSON.parse(
  readFileSync(join(import.meta.dirname, "upstream-diagnostic-exceptions.json"), "utf8"),
) as UpstreamException[];

function isCoveredBy(exception: UpstreamException, diagnostic: string): boolean {
  return (
    diagnostic.startsWith(`[${exception.code}]`) && diagnostic.includes(exception.reportedUnder)
  );
}

let devServer: RunningServer | undefined;

beforeAll(async () => {
  devServer = await startServer({
    directory: appDirectory,
    command: [installedVp, "dev", "--force", ...viteOnAFreePort],
    environment: { NODE_ENV: "development" },
  });
});

afterAll(async () => {
  await devServer?.stop();
});

function devUrl(): string {
  if (devServer === undefined) throw new Error("The development server did not start.");
  return devServer.url;
}

describe.each(enginesToVerify())("in %s", (engine) => {
  let browser: Browser;
  const diagnostics: string[] = [];

  beforeAll(async () => {
    browser = await browserType(engine).launch();
    const page = await browser.newPage();
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        diagnostics.push(message.text());
      }
    });
    page.on("pageerror", (error) => diagnostics.push(String(error)));

    await opened(page, devUrl(), "hydrated");
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
  });

  test("Solid's development build reports no diagnostics from our own code", () => {
    const unexpected = diagnostics.filter(
      (diagnostic) => !upstreamExceptions.some((exception) => isCoveredBy(exception, diagnostic)),
    );

    expect(unexpected).toEqual([]);
  });

  test("every upstream exception still describes a diagnostic that is reported", () => {
    const noLongerReported = upstreamExceptions.filter(
      (exception) => !diagnostics.some((diagnostic) => isCoveredBy(exception, diagnostic)),
    );

    expect(noLongerReported).toEqual([]);
  });
});

test("no upstream exception is past its expiry date", () => {
  const today = new Date().toISOString().slice(0, 10);

  expect(upstreamExceptions.filter((exception) => exception.expires < today)).toEqual([]);
});
