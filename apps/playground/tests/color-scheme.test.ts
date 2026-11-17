import type { Browser, BrowserContextOptions, Page } from "playwright";
import { describe, expect, inject, test } from "vite-plus/test";
import { tokenValues } from "../../../scripts/tokens";
import { elementsOf, valuesOf } from "../../../packages/core/tests/markup";
import { policyHeader } from "#/src/middleware.ts";
import { pageColorScheme } from "#/src/page-color-scheme.ts";
import {
  colorSchemeSection,
  forcedSection,
  playgroundColorSchemeKey,
  schemeButtons,
  schemeTexts,
} from "#/src/sections/color-scheme-setups.ts";
import { computed, inEveryEngine } from "#/tests/support/playground.ts";

const url = inject("playgroundUrl");
const ownerAttribute = "data-color-scheme";
const ownerDefault = pageColorScheme;
const schemes = ["light", "dark"] as const;
type Scheme = (typeof schemes)[number];
const perScheme = /^light-dark\((oklch\([^)]*\)), (oklch\([^)]*\))\)$/;
const tokens = tokenValues();
const clientScript = "**/assets/**/*.js";

function written(token: string, scheme: Scheme): string {
  const match = perScheme.exec(tokens[token] ?? "");
  if (!match) throw new Error(`${token} is not written as light-dark(<light>, <dark>).`);
  return scheme === "light" ? match[1] : match[2];
}

async function colourOf(page: Page, value: string): Promise<string> {
  return page.evaluate((colour) => {
    const probe = document.createElement("i");
    probe.style.color = colour;
    document.body.append(probe);
    const found = getComputedStyle(probe).color;
    probe.remove();
    return found;
  }, value);
}

type Opened = { page: Page; problems: string[]; close: () => Promise<void> };

async function open(
  browser: Browser,
  scheme: Scheme,
  options: BrowserContextOptions & { stored?: string; blockClient?: boolean } = {},
): Promise<Opened> {
  const { stored, blockClient, ...contextOptions } = options;
  const context = await browser.newContext({ colorScheme: scheme, ...contextOptions });
  if (stored !== undefined) {
    await context.addInitScript(
      ([key, value]) => {
        if (!sessionStorage.getItem("seeded")) {
          localStorage.setItem(key, value);
          sessionStorage.setItem("seeded", "yes");
        }
      },
      [playgroundColorSchemeKey, stored],
    );
  }
  if (blockClient) await context.route(clientScript, (route) => route.abort());
  const page = await context.newPage();
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(String(error)));
  await page.goto(url, {
    waitUntil: contextOptions.javaScriptEnabled === false || blockClient ? "load" : "networkidle",
  });
  return { page, problems, close: () => context.close() };
}

function attributeOf(page: Page): Promise<string | null> {
  return page.evaluate((name) => document.documentElement.getAttribute(name), ownerAttribute);
}

function settledOn(page: Page, scheme: string): Promise<unknown> {
  return page.waitForFunction(
    ([name, value]) => document.documentElement.getAttribute(name) === value,
    [ownerAttribute, scheme],
  );
}

async function expectTheScheme(page: Page, scheme: Scheme): Promise<void> {
  const section = page.getByRole("region", { name: colorSchemeSection });
  const input = section.getByRole("textbox", { name: schemeTexts.pageInput });

  expect(await computed(page.locator("body"), "background-color"), "the page").toBe(
    await colourOf(page, written("--solix-color-body", scheme)),
  );
  expect(await computed(input, "color"), "a component's text").toBe(
    await colourOf(page, written("--solix-color-text", scheme)),
  );
  expect(await computed(input, "border-top-color"), "a component's border").toBe(
    await colourOf(page, written("--solix-color-border", scheme)),
  );
  expect(await computed(input, "color-scheme"), "a native control follows").toContain(scheme);
  expect(await section.getByText(schemeTexts.shownInDark).isVisible()).toBe(scheme === "dark");
  expect(await section.getByText(schemeTexts.shownInLight).isVisible()).toBe(scheme === "light");
}

function chosen(page: Page, label: string = schemeTexts.chosen): Promise<string | null> {
  return page.getByRole("status", { name: label }).textContent();
}

function press(page: Page, name: string): Promise<void> {
  return page
    .getByRole("region", { name: colorSchemeSection })
    .getByRole("button", { name, exact: true })
    .click();
}

function storedIn(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), playgroundColorSchemeKey);
}

test("the server writes data-color-scheme=auto on <html> and, in <head>, one script with the page's nonce that sets the scheme before the page paints", async () => {
  const response = await fetch(url);
  const nonce = /'nonce-([^']+)'/.exec(response.headers.get(policyHeader) ?? "")?.[1];
  const html = await response.text();
  const [root] = elementsOf(html).filter(({ tag }) => tag === "html");
  const head = html.slice(0, html.indexOf("</head>"));
  const prePaint = [...head.matchAll(/(<script[^>]*>)([^<]*)<\/script>/g)].filter(([, , text]) =>
    text.includes(JSON.stringify(playgroundColorSchemeKey)),
  );

  expect(nonce).toBeDefined();
  expect(valuesOf(root, ownerAttribute)).toEqual([ownerDefault]);
  expect(prePaint).toHaveLength(1);
  expect(prePaint.map(([, tag]) => valuesOf(elementsOf(tag)[0], "nonce"))).toEqual([[nonce]]);
});

inEveryEngine((browser) => {
  describe.each(schemes)("with the system in the %s scheme", (system) => {
    const other: Scheme = system === "light" ? "dark" : "light";

    test("with scripts off, auto follows the system: the tokens, color-scheme and lightHidden or darkHidden", async () => {
      const { page, close } = await open(browser(), system, { javaScriptEnabled: false });

      expect(await attributeOf(page)).toBe(ownerDefault);
      await expectTheScheme(page, system);
      await close();
    });

    test("with the client blocked, the pre-paint script alone sets the stored scheme", async () => {
      const { page, close } = await open(browser(), system, { stored: other, blockClient: true });

      expect(await attributeOf(page)).toBe(other);
      await expectTheScheme(page, other);
      await close();
    });

    test("hydrated with nothing stored, the provider keeps auto and writes the system's scheme; each button sets, stores, toggles and clears it", async () => {
      const { page, problems, close } = await open(browser(), system);
      await settledOn(page, system);

      expect(await chosen(page)).toBe(ownerDefault);
      expect(await chosen(page, schemeTexts.computed)).toBe(system);
      await expectTheScheme(page, system);
      const themedInTheSystemScheme = await computed(
        page.getByTestId("themed"),
        "background-color",
      );

      await press(page, schemeButtons.toggle);
      await settledOn(page, other);
      expect(await chosen(page)).toBe(other);
      expect(await storedIn(page)).toBe(other);
      await expectTheScheme(page, other);
      expect(
        await computed(page.getByTestId("themed"), "background-color"),
        "a consumer's override of a token wins in either scheme",
      ).toBe(themedInTheSystemScheme);
      expect(await computed(page.getByTestId("default"), "background-color")).toBe(
        await colourOf(page, written("--solix-color-primary", other)),
      );

      await press(page, schemeButtons[system]);
      await settledOn(page, system);
      expect(await storedIn(page)).toBe(system);

      await press(page, schemeButtons.auto);
      expect(await storedIn(page)).toBe("auto");
      await settledOn(page, system);

      await press(page, schemeButtons[other]);
      await settledOn(page, other);
      await press(page, schemeButtons.clear);
      await settledOn(page, system);
      expect(await chosen(page)).toBe(ownerDefault);
      expect(await storedIn(page)).toBeNull();
      expect(problems).toEqual([]);
      await close();
    });

    test("hydrated with a scheme stored, the provider reads it, and a change of the system's scheme moves auto", async () => {
      const { page, close } = await open(browser(), system, { stored: other });
      await settledOn(page, other);

      expect(await chosen(page)).toBe(other);
      await press(page, schemeButtons.auto);
      await settledOn(page, system);
      await page.emulateMedia({ colorScheme: other });
      await settledOn(page, other);
      expect(await chosen(page, schemeTexts.computed)).toBe(other);
      await close();
    });

    test("a scheme set on another page of the same origin reaches this one through the storage event", async () => {
      const first = await open(browser(), system);
      const second = await first.page.context().newPage();
      await second.goto(url, { waitUntil: "networkidle" });
      await settledOn(second, system);

      await press(first.page, schemeButtons[other]);
      await settledOn(second, other);
      expect(await chosen(second)).toBe(other);
      await first.close();
    });

    test("with a storage that throws, the page still renders the default and each button still switches it", async () => {
      const context = await browser().newContext({ colorScheme: system });
      await context.addInitScript(() => {
        Object.defineProperty(window, "localStorage", {
          get: () => {
            throw new DOMException("The storage is blocked.", "SecurityError");
          },
        });
      });
      const page = await context.newPage();
      const problems: string[] = [];
      page.on("pageerror", (error) => problems.push(String(error)));
      await page.goto(url, { waitUntil: "networkidle" });
      await settledOn(page, system);

      await press(page, schemeButtons[other]);
      await settledOn(page, other);
      await expectTheScheme(page, other);
      expect(problems).toEqual([]);
      await context.close();
    });

    test("a provider given forceColorScheme and getRootElement writes the forced scheme on its own element, which its controls neither change nor store, and leaves <html> to the page's provider", async () => {
      const { page, close } = await open(browser(), system);
      await settledOn(page, system);
      const forced = page.getByRole("region", { name: forcedSection });
      const input = forced.getByRole("textbox", { name: schemeTexts.forcedInput });

      await expect
        .poll(() => forced.evaluate((node, name) => node.getAttribute(name), ownerAttribute))
        .toBe("dark");
      expect(await chosen(page, schemeTexts.forcedChosen)).toBe("dark");
      expect(await computed(input, "background-color")).toBe(
        await colourOf(page, written("--solix-color-body", "dark")),
      );
      expect(await attributeOf(page)).toBe(system);

      await forced.getByRole("button", { name: schemeButtons.forcedLight }).click();
      expect(await chosen(page, schemeTexts.forcedChosen)).toBe("dark");
      expect(await forced.evaluate((node, name) => node.getAttribute(name), ownerAttribute)).toBe(
        "dark",
      );
      expect(
        await page.evaluate(() => Object.keys(localStorage)),
        "a forced provider stores nothing",
      ).toEqual([]);
      await close();
    });
  });
});
