import type { Locator, Page } from "playwright";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  test,
} from "vite-plus/test";
import {
  computed,
  type Expected,
  inEveryEngine,
  openPage,
  type OpenPage,
  scriptModes,
} from "#/tests/support/playground.ts";

const url = inject("playgroundUrl");

inEveryEngine((browser) => {
  describe("a disclosure in a freshly hydrated page", () => {
    let opened: OpenPage;
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
      opened = await openPage(browser(), url);
      ({ page, expected } = opened);
      summary = page.locator("summary").filter({ hasText: "Toggle" });
      content = page.getByText("Hidden content");
    });

    afterEach(async () => {
      await opened.close();
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
    const { page, expected, close } = await openPage(browser(), url, { javaScriptEnabled: false });
    const summary = page.locator("summary").filter({ hasText: "Toggle" });

    await summary.click();

    await expect.poll(() => page.getByText("Hidden content").isVisible()).toBe(true);
    expect(await computed(summary, "background-color")).toBe(expected("--solix-color-primary"));

    await close();
  });

  describe.each(scriptModes)("a Disclosure's parts with scripts %s", (_, javaScriptEnabled) => {
    let opened: OpenPage;

    beforeAll(async () => {
      opened = await openPage(browser(), url, { javaScriptEnabled });
    });

    afterAll(async () => {
      await opened.close();
    });

    test("styles on a part beats the library's style and the consumer's class on that part, closed and open", async () => {
      const summary = opened.page.locator("summary").filter({ hasText: "Styled parts" });

      expect(
        await computed(summary, "background-color"),
        "styles.summary beats both the .danger class that classes.summary names and the library's background",
      ).toBe(opened.expected("partBackground"));
      expect(
        await computed(summary, "color"),
        "styles.summary beats the library's text colour",
      ).toBe(opened.expected("partText"));
      expect(
        await computed(summary, "outline-style"),
        "the .outlined class that classes.summary names still applies",
      ).toBe("solid");
      expect(await computed(summary, "cursor"), "the library's cursor stays").toBe("pointer");

      await summary.click();
      await expect
        .poll(() => opened.page.getByText("Content of the styled parts").isVisible())
        .toBe(true);

      expect(
        await computed(summary, "background-color"),
        "styles.summary beats the library's open background",
      ).toBe(opened.expected("partBackground"));
      expect(
        await computed(summary, "color"),
        "styles.summary beats the library's open text colour",
      ).toBe(opened.expected("partText"));
    });
  });
});
