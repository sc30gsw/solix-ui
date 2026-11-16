import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, test } from "vite-plus/test";
import type { BrowserValuePrimitive } from "../../../packages/primitives/fixtures/primitive-kinds";
import { inEveryEngine, openPage, type OpenPage } from "./support/playground";

const url = inject("playgroundUrl");
const probe = "output[data-hydration-probe]";
const revealWait = { timeout: 5_000 };
const headroomCalls = '[data-case-calls="createHeadroom"]';

type Revealed = { expected: string; restore: () => Promise<unknown> };

function scrolledTo(page: Page, y: number): Promise<void> {
  return page.evaluate(
    (top) =>
      new Promise<void>((resolve) => {
        if (Math.round(window.scrollY) === top) {
          resolve();
          return;
        }
        document.addEventListener("scroll", () => resolve(), { once: true });
        window.scrollTo({ top, behavior: "instant" });
      }),
    y,
  );
}

function region(page: Page, name: string) {
  return page.locator(`[data-case-region="${name}"]`);
}

async function sized(page: Page, name: string): Promise<() => Promise<unknown>> {
  await region(page, name).evaluate((element) => {
    if (!(element instanceof HTMLElement)) return;
    Object.assign(element.style, {
      boxSizing: "border-box",
      width: "200px",
      height: "50px",
      padding: "10px",
      border: "0",
    });
  });
  return () => region(page, name).evaluate((element) => element.removeAttribute("style"));
}

async function scrolledIntoView(page: Page, name: string): Promise<Revealed> {
  await region(page, name).scrollIntoViewIfNeeded();
  return { expected: "true", restore: () => scrolledTo(page, 0) };
}

const reveal: { [K in BrowserValuePrimitive]: (page: Page) => Promise<Revealed> } = {
  createActiveElement: async (page) => {
    await page.evaluate(() => document.querySelector("h1")?.focus());
    return { expected: '"body"', restore: async () => undefined };
  },
  createDocumentVisibility: async (page) => {
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    return {
      expected: '"hidden"',
      restore: () =>
        page.evaluate(() => {
          Reflect.deleteProperty(document, "visibilityState");
          document.dispatchEvent(new Event("visibilitychange"));
        }),
    };
  },
  createElementSize: async (page) => ({
    expected: "[200,50]",
    restore: await sized(page, "createElementSize"),
  }),
  createFocusWithin: async (page) => {
    await region(page, "createFocusWithin").focus();
    return {
      expected: "true",
      restore: async () => {
        await region(page, "createFocusWithin").blur();
        await scrolledTo(page, 0);
      },
    };
  },
  createHeadroom: async (page) => {
    await scrolledTo(page, 0);
    await scrolledTo(page, 200);
    return { expected: "[false,0]", restore: () => scrolledTo(page, 0) };
  },
  createHover: async (page) => {
    await region(page, "createHover").hover();
    return {
      expected: "true",
      restore: async () => {
        await page.mouse.move(0, 0);
        await scrolledTo(page, 0);
      },
    };
  },
  createInViewport: (page) => scrolledIntoView(page, "createInViewport"),
  createIntersection: (page) => scrolledIntoView(page, "createIntersection"),
  createMediaQuery: async () => ({ expected: "[true,true]", restore: async () => undefined }),
  createResizeObserver: async (page) => ({
    expected: JSON.stringify({
      x: 10,
      y: 10,
      width: 180,
      height: 30,
      top: 10,
      left: 10,
      bottom: 40,
      right: 190,
    }),
    restore: await sized(page, "createResizeObserver"),
  }),
  createScrollDirection: async (page) => {
    await scrolledTo(page, 120);
    await scrolledTo(page, 80);
    return { expected: '"up"', restore: () => scrolledTo(page, 0) };
  },
  createTextSelection: async (page) => {
    await page.evaluate(() => {
      const heading = document.querySelector("h1");
      if (heading) document.getSelection()?.selectAllChildren(heading);
    });
    return {
      expected: '"Range"',
      restore: () => page.evaluate(() => document.getSelection()?.removeAllRanges()),
    };
  },
  createViewportSize: async (page) => ({
    expected: await page.evaluate(() => JSON.stringify([window.innerWidth, window.innerHeight])),
    restore: async () => undefined,
  }),
  createWindowScroll: async (page) => {
    await scrolledTo(page, 40);
    return { expected: JSON.stringify({ x: 0, y: 40 }), restore: () => scrolledTo(page, 0) };
  },
};

function line(page: Page, start: string): Promise<string | null> {
  return page.getByText(new RegExp(`^${start}: `)).textContent();
}

function decoded(markup: string): string {
  return markup
    .replace(/<!--.*?-->/gs, "")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function shownInMarkup(html: string): Map<string, string> {
  const outputs = html.matchAll(/<output[^>]*data-case-value="([^"]+)"[^>]*>(.*?)<\/output>/gs);
  return new Map([...outputs].map(([, name, text]) => [name, decoded(text)]));
}

async function hydratedWhileScrolled(browser: Browser, y: number): Promise<string | null> {
  const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
  try {
    const page = await context.newPage();
    const gate: { open: () => void } = { open: () => undefined };
    const opened = new Promise<void>((resolve) => {
      gate.open = resolve;
    });
    await page.route("**/*.js", async (route) => {
      await opened;
      await route.continue();
    });
    await page.goto(url, { waitUntil: "commit" });
    await page.locator(headroomCalls).waitFor({ state: "attached" });
    await scrolledTo(page, y);
    gate.open();
    await page.waitForFunction(() =>
      document.querySelector("output[data-hydration-probe][data-hydrated-as]"),
    );
    await page.waitForLoadState("networkidle");
    return await page.locator(headroomCalls).textContent();
  } finally {
    await context.close();
  }
}

async function scrollCommandsWhileLoading(browser: Browser): Promise<string[]> {
  const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
  try {
    await context.addInitScript(() => {
      const calls: string[] = [];
      const scrollTo = window.scrollTo.bind(window);
      Reflect.set(window, "scrollCommands", calls);
      window.scrollTo = (...args: [ScrollToOptions?] | [number, number]) => {
        calls.push(JSON.stringify(args));
        Reflect.apply(scrollTo, window, args);
      };
    });
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(() =>
      document.querySelector("output[data-hydration-probe][data-hydrated-as]"),
    );
    await page.waitForLoadState("networkidle");
    return await page.evaluate((): string[] => Reflect.get(window, "scrollCommands"));
  } finally {
    await context.close();
  }
}

test("the server renders the regions and lines the page shows, and probes the client has not claimed yet", async () => {
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

    test("after each primitive, the client claims the probe the server sent, with the server's id", async () => {
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

    test("each value its server case reads gives, while the page hydrates, what the server's markup shows", async () => {
      const html = await (await fetch(url)).text();
      const shown = shownInMarkup(html);

      expect(shown.size).toBeGreaterThan(0);
      for (const [name, text] of shown) {
        const hydrating = await opened.page
          .locator(`${probe}[data-after="${name}"]`)
          .getAttribute("data-read-while-hydrating");
        expect(hydrating, `${name}: what it read while the page hydrated`).toBe(text);
      }
    });

    test("each BrowserValue then reads the browser's value", async () => {
      const { page } = opened;

      for (const [name, revealed] of Object.entries<(page: Page) => Promise<Revealed>>(reveal)) {
        const { expected, restore } = await revealed(page);
        try {
          await expect
            .poll(() => page.locator(`[data-case-value="${name}"]`).textContent(), revealWait)
            .toBe(expected);
        } finally {
          await restore();
        }
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

  test("a browser command called in a component's body while the page hydrates does nothing, and the same command called from an effect's first run acts", async () => {
    expect(await scrollCommandsWhileLoading(browser())).toEqual([
      JSON.stringify([{ behavior: "smooth" }]),
    ]);
  });

  test("a page that hydrates scrolled past fixedAt calls no headroom callback, and one that hydrates at the top calls onPin and onFix", async () => {
    expect(await hydratedWhileScrolled(browser(), 400)).toBe("none");
    expect(await hydratedWhileScrolled(browser(), 0)).toBe("pin fix");
  });
});
