import { type ChildProcess, spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser, Locator, Page } from "playwright";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vite-plus/test";
import { browserType, enginesToVerify } from "../../../scripts/browser-engines.mjs";
import { expectedValues } from "../../../scripts/expected-values.mjs";
import { LIBRARY_CASCADE_LAYER } from "../../../packages/core/build-pipeline.mjs";
import { builtComponents } from "../../../packages/core/tests/built-components";

const appDirectory = join(import.meta.dirname, "..");
const port = 4319;
const url = `http://127.0.0.1:${port}/`;

let server: ChildProcess;

type Expected = Awaited<ReturnType<typeof expectedValues>>;

function computed(element: Locator, property: string): Promise<string> {
  return element.evaluate((node, name) => getComputedStyle(node).getPropertyValue(name), property);
}

async function serverAnswers(): Promise<boolean> {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  server = spawn("node", ["dist/server/node.js"], {
    cwd: appDirectory,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
    stdio: "ignore",
  });
  await vi.waitUntil(serverAnswers, { timeout: 10_000 });
});

afterAll(() => {
  server.kill();
});

describe("a consumer with no StyleX build setup", () => {
  test("depends on no StyleX build plugin", () => {
    const manifest = JSON.parse(readFileSync(join(appDirectory, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const stylexPackages = Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    }).filter((name) => name.startsWith("@stylexjs/"));

    expect(stylexPackages).toEqual(["@stylexjs/stylex"]);
  });

  test("gets server-rendered markup that carries the library's classes", async () => {
    const html = await (await fetch(url)).text();

    for (const name of builtComponents) {
      expect(html, `apps/playground/src/App.tsx: render <${name}>`).toContain(`solix-${name}-root`);
    }
    expect(html).toMatch(/<summary[^>]*class="[^"]*solix-Disclosure-summary/);
    expect(html).toMatch(/<div[^>]*class="[^"]*solix-Disclosure-content/);
    expect(html).toMatch(/<dialog(?![^>]*\sopen)[^>]*class="[^"]*solix-Modal-root/);
  });

  test("gets its own stylesheet before the library layer in the bundle", () => {
    const assets = join(appDirectory, "dist/client/assets");
    const bundle = readdirSync(assets)
      .filter((file) => file.endsWith(".css"))
      .map((file) => readFileSync(join(assets, file), "utf8"))
      .join("\n");
    const consumerRule = bundle.indexOf(".danger");
    const libraryLayer = bundle.indexOf(`@layer ${LIBRARY_CASCADE_LAYER}`);

    expect(consumerRule).toBeGreaterThanOrEqual(0);
    expect(libraryLayer).toBeGreaterThan(consumerRule);
  });
});

describe.each(enginesToVerify())("in %s", (engine) => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await browserType(engine).launch();
  });

  afterAll(async () => {
    await browser.close();
  });

  test("a consumer with no StyleX build setup sees styled markup before any script runs", async () => {
    const scriptless = await browser.newContext({ javaScriptEnabled: false });
    const page = await scriptless.newPage();
    await page.goto(url);
    const expected = await expectedValues(page, { sentinels: true });

    expect(await computed(page.getByTestId("default"), "background-color")).toBe(
      expected("--solix-color-primary"),
    );

    await scriptless.close();
  });

  describe("in the hydrated page", () => {
    let page: Page;
    let expected: Expected;
    const consoleProblems: string[] = [];

    beforeAll(async () => {
      page = await browser.newPage();
      page.on("console", (message) => {
        if (message.type() === "error" || message.type() === "warning") {
          consoleProblems.push(message.text());
        }
      });
      page.on("pageerror", (error) => consoleProblems.push(String(error)));
      await page.goto(url, { waitUntil: "networkidle" });
      expected = await expectedValues(page, { sentinels: true });
    });

    test("hydration reports no console errors or warnings", () => {
      expect(consoleProblems).toEqual([]);
    });

    test("a consumer's plain class beats the library default it targets, and nothing else", async () => {
      expect(await computed(page.getByTestId("default"), "background-color")).toBe(
        expected("--solix-color-primary"),
      );
      expect(await computed(page.getByTestId("overridden"), "background-color")).toBe(
        expected("danger"),
      );
      expect(await computed(page.getByTestId("overridden"), "color")).toBe(
        expected("--solix-color-on-primary"),
      );
      expect(await computed(page.getByTestId("overridden"), "height")).toBe(
        expected("--solix-control-height-md"),
      );
      expect(await computed(page.getByTestId("overridden"), "border-top-left-radius")).toBe(
        expected("--solix-radius-md"),
      );
    });

    test("a class and an attribute that change after the first render reach each component's root", async () => {
      const emphasise = page.getByRole("button", { name: "Emphasise" });
      const follower = page.locator("details").filter({ hasText: "Follows the Emphasise button" });
      expect(await computed(emphasise, "background-color")).toBe(expected("--solix-color-primary"));
      expect(await emphasise.getAttribute("aria-pressed")).toBe("false");
      expect(await computed(follower, "outline-style")).toBe("none");

      await emphasise.click();

      await expect.poll(() => computed(emphasise, "background-color")).toBe(expected("danger"));
      expect(await emphasise.getAttribute("aria-pressed")).toBe("true");
      expect(await computed(follower, "outline-style")).toBe("solid");

      await emphasise.click();

      await expect
        .poll(() => computed(emphasise, "background-color"))
        .toBe(expected("--solix-color-primary"));
      expect(await computed(follower, "outline-style")).toBe("none");
    });

    test("a consumer rethemes a subtree by overriding a public token", async () => {
      expect(await computed(page.getByTestId("themed"), "background-color")).toBe(
        expected("brandGreen"),
      );
    });
  });

  describe("a disclosure in a freshly hydrated page", () => {
    let page: Page;
    let expected: Expected;
    let summary: Locator;
    let content: Locator;

    function detailsIsOpen(): Promise<boolean> {
      return page
        .locator("details")
        .filter({ has: summary })
        .evaluate((details: HTMLDetailsElement) => details.open);
    }

    async function expectClosed(): Promise<void> {
      await expect.poll(detailsIsOpen).toBe(false);
      expect(await computed(summary, "background-color")).toBe(expected("--solix-color-surface"));
      expect(await content.isVisible()).toBe(false);
    }

    async function expectOpen(): Promise<void> {
      await expect.poll(detailsIsOpen).toBe(true);
      expect(await computed(summary, "background-color")).toBe(expected("--solix-color-primary"));
      expect(await computed(summary, "color")).toBe(expected("--solix-color-on-primary"));
      expect(await content.isVisible()).toBe(true);
      expect(await computed(content, "border-left-color")).toBe(expected("--solix-color-primary"));
    }

    beforeEach(async () => {
      page = await browser.newPage();
      summary = page.locator("summary").filter({ hasText: "Toggle" });
      content = page.getByText("Hidden content");
      await page.goto(url, { waitUntil: "networkidle" });
      expected = await expectedValues(page, { sentinels: true });
    });

    afterEach(async () => {
      await page.close();
    });

    test("starts closed, opens on a click of its summary and closes on the next click", async () => {
      await expectClosed();

      await summary.click();
      await expectOpen();

      await summary.click();
      await expectClosed();
    });

    test("opens on Enter and closes on Space while its summary has focus", async () => {
      await expectClosed();

      await summary.focus();
      await page.keyboard.press("Enter");
      await expectOpen();

      await page.keyboard.press("Space");
      await expectClosed();
    });

    test("keeps a closed disclosure inside an open one looking closed", async () => {
      const innerSummary = page.locator("summary").filter({ hasText: "Inner" });

      await summary.click();
      await expectOpen();
      expect(await computed(innerSummary, "background-color")).toBe(
        expected("--solix-color-surface"),
      );
      expect(await computed(innerSummary, "color")).toBe(expected("--solix-color-text"));

      await innerSummary.click();
      await expect
        .poll(() => computed(innerSummary, "background-color"))
        .toBe(expected("--solix-color-primary"));
      expect(await computed(summary, "background-color")).toBe(expected("--solix-color-primary"));
    });
  });

  test("a disclosure opens with scripts turned off", async () => {
    const scriptless = await browser.newContext({ javaScriptEnabled: false });
    const page = await scriptless.newPage();
    await page.goto(url);
    const expected = await expectedValues(page, { sentinels: true });
    const summary = page.locator("summary").filter({ hasText: "Toggle" });

    await summary.click();

    await expect.poll(() => page.getByText("Hidden content").isVisible()).toBe(true);
    expect(await computed(summary, "background-color")).toBe(expected("--solix-color-primary"));

    await scriptless.close();
  });

  describe("a text input in a freshly hydrated page", () => {
    let page: Page;
    let expected: Expected;
    let email: Locator;

    beforeEach(async () => {
      page = await browser.newPage();
      email = page.getByRole("textbox", { name: "Email" });
      await page.goto(url, { waitUntil: "networkidle" });
      expected = await expectedValues(page, { sentinels: true });
    });

    afterEach(async () => {
      await page.close();
    });

    test("has the library's border, and a consumer's plain class beats its background", async () => {
      const overridden = page.getByRole("textbox", { name: "Overridden input" });

      expect(await computed(email, "border-top-color")).toBe(expected("--solix-color-border"));
      expect(await computed(email, "border-top-left-radius")).toBe(expected("--solix-radius-md"));
      expect(await computed(email, "background-color")).toBe(expected("--solix-color-body"));
      expect(await computed(email, "color")).toBe(expected("--solix-color-text"));
      expect(await computed(overridden, "background-color")).toBe(expected("danger"));
      expect(await computed(overridden, "height")).toBe(expected("--solix-control-height-md"));
    });

    test("shows the error border only after the user has committed an invalid value", async () => {
      await email.fill("not an address");
      await expect
        .poll(() => computed(email, "border-top-color"))
        .not.toBe(expected("--solix-color-error"));

      await page.getByRole("button", { name: "Default" }).focus();
      await expect
        .poll(() => computed(email, "border-top-color"))
        .toBe(expected("--solix-color-error"));

      await email.fill("someone@example.com");
      await page.getByRole("button", { name: "Default" }).focus();
      await expect
        .poll(() => computed(email, "border-top-color"))
        .toBe(expected("--solix-color-border"));
    });

    test("takes the primary border while it has keyboard focus", async () => {
      await email.focus();
      await page.keyboard.press("ArrowRight");

      await expect
        .poll(() => computed(email, "border-top-color"))
        .toBe(expected("--solix-color-primary"));
    });

    test("looks disabled and cannot be typed in when disabled", async () => {
      const disabled = page.getByRole("textbox", { name: "Disabled input" });

      expect(await computed(disabled, "opacity")).toBe("0.6");
      expect(await computed(disabled, "cursor")).toBe("not-allowed");
      expect(await disabled.isEditable()).toBe(false);
    });
  });

  describe("a modal in a freshly hydrated page", () => {
    let page: Page;
    let expected: Expected;
    let dialog: Locator;
    let opener: Locator;
    let readout: Locator;

    beforeEach(async () => {
      page = await browser.newPage();
      dialog = page.getByRole("dialog", { name: "Settings" });
      opener = page.getByRole("button", { name: "Open modal" });
      readout = page.getByText(/^The app records the modal as/);
      await page.goto(url, { waitUntil: "networkidle" });
      expected = await expectedValues(page, { sentinels: true });
    });

    afterEach(async () => {
      await page.close();
    });

    test("starts closed and opens as a modal over the page when the app asks", async () => {
      expect(await dialog.count()).toBe(0);

      await opener.click();

      await dialog.waitFor({ state: "visible" });
      expect(await dialog.evaluate((node) => node.matches(":modal"))).toBe(true);
      expect(await dialog.getByRole("heading", { name: "Settings" }).isVisible()).toBe(true);
      expect(await computed(dialog, "background-color")).toBe(expected("--solix-color-body"));
      expect(await computed(dialog, "color")).toBe(expected("--solix-color-text"));
      expect(await computed(dialog, "border-top-color")).toBe(expected("--solix-color-border"));
      expect(await computed(dialog, "border-top-left-radius")).toBe(expected("--solix-radius-md"));
      expect(
        await dialog.evaluate((node) => getComputedStyle(node, "::backdrop").backgroundColor),
      ).toBe(expected("--solix-color-backdrop"));
      await expect.poll(() => readout.textContent()).toBe("The app records the modal as opened.");
    });

    test("tells the app it closed, whichever way the user closed it", async () => {
      const closers: [string, () => Promise<void>][] = [
        ["the Escape key", () => page.keyboard.press("Escape")],
        ["the Close button", () => dialog.getByRole("button", { name: "Close" }).click()],
        ["a press outside the dialog", () => page.mouse.click(2, 2)],
      ];

      for (const [, close] of closers) {
        await opener.click();
        await dialog.waitFor({ state: "visible" });

        await close();

        await dialog.waitFor({ state: "hidden" });
        await expect.poll(() => readout.textContent()).toBe("The app records the modal as closed.");
      }
    });

    test("stays open when the user presses inside it", async () => {
      await opener.click();
      await dialog.waitFor({ state: "visible" });

      await dialog.getByText("Modal content").click();
      await dialog.getByRole("textbox", { name: "Name" }).click();

      expect(await dialog.isVisible()).toBe(true);
      await expect.poll(() => readout.textContent()).toBe("The app records the modal as opened.");
    });
  });

  test("a modal stays closed with scripts turned off", async () => {
    const scriptless = await browser.newContext({ javaScriptEnabled: false });
    const page = await scriptless.newPage();
    await page.goto(url);
    const expected = await expectedValues(page, { sentinels: true });

    expect(await page.locator("dialog").isVisible()).toBe(false);
    expect(await computed(page.getByRole("textbox", { name: "Email" }), "border-top-color")).toBe(
      expected("--solix-color-border"),
    );

    await scriptless.close();
  });
});
