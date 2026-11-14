import type { Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, test } from "vite-plus/test";
import { inEveryEngine, openPage, type OpenPage } from "./support/playground";

const url = inject("playgroundUrl");
const probe = "output[data-hydration-probe]";

function pressesOutside(page: Page): Promise<string | null> {
  return page.getByText(/^Presses outside the region: /).textContent();
}

test("the server renders the element a primitive takes a ref to, with its state at the server value", async () => {
  const html = await (await fetch(url)).text();

  expect(html).toMatch(/<div[^>]*class="region"[^>]*>A region that counts presses outside it/);
  expect(html).toMatch(/Presses outside the region: (?:<!--[^>]*-->)*0/);
  expect(html).toMatch(/<output[^>]*data-hydration-probe="[^"]+"/);
  expect(html).not.toMatch(/data-hydrated-as/);
});

inEveryEngine((browser) => {
  describe("in the hydrated page", () => {
    let opened: OpenPage;

    beforeAll(async () => {
      opened = await openPage(browser(), url);
    });

    afterAll(async () => {
      await opened.close();
    });

    test("the hydration keys after an element primitive line up: the element rendered after it is the one the server sent, claimed with the same id", async () => {
      const ids = await opened.page
        .locator(probe)
        .evaluateAll((elements) =>
          elements.map((element) => [
            element.getAttribute("data-hydration-probe"),
            element.getAttribute("data-hydrated-as"),
          ]),
        );

      expect(ids.length).toBe(1);
      expect(ids[0][1], "the client claimed the server's element with the server's id").toBe(
        ids[0][0],
      );
    });

    test("the primitive attached after hydration: a press inside its element does nothing, and a press outside it counts", async () => {
      const { page } = opened;
      const region = page.getByText("A region that counts presses outside it");

      await region.click();
      expect(await pressesOutside(page)).toBe("Presses outside the region: 0");
      await page.getByRole("heading", { name: "Primitives" }).click();
      await expect.poll(() => pressesOutside(page)).toBe("Presses outside the region: 1");
    });

    test("hydrating the page raised no hydration warning or error", () => {
      expect(opened.consoleProblems).toEqual([]);
    });
  });
});
