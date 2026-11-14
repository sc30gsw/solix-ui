import type { Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, test } from "vite-plus/test";
import { inEveryEngine, openPage, type OpenPage } from "./support/playground";

const url = inject("playgroundUrl");
const probe = "output[data-hydration-probe]";

function line(page: Page, start: string): Promise<string | null> {
  return page.getByText(new RegExp(`^${start}: `)).textContent();
}

test("the server renders the element each element primitive takes a ref to, with its state at the server value, and a probe after it", async () => {
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

    test("after each element primitive, the client claims the element the server sent, with the server's id", async () => {
      const probes = await opened.page.locator(probe).evaluateAll((elements) =>
        elements.map((element) => ({
          after: element.getAttribute("data-after"),
          server: element.getAttribute("data-hydration-probe"),
          client: element.getAttribute("data-hydrated-as"),
        })),
      );

      expect(probes.length).toBeGreaterThan(0);
      for (const { after, server, client } of probes) {
        expect(
          client,
          `after ${after}, the client claimed the server's element with the server's id`,
        ).toBe(server);
      }
    });

    test("the primitives attached after hydration: a press inside the click-outside region does nothing and one outside counts, and a click on the listening region counts", async () => {
      const { page } = opened;

      await page.getByText("A region that counts presses outside it").click();
      expect(await line(page, "Presses outside the region")).toBe("Presses outside the region: 0");
      await page.getByRole("heading", { name: "Primitives" }).click();
      await expect
        .poll(() => line(page, "Presses outside the region"))
        .toBe("Presses outside the region: 1");
      await page.getByText("A region that counts clicks on it").click();
      await expect.poll(() => line(page, "Clicks on the region")).toBe("Clicks on the region: 1");
    });
  });
});
