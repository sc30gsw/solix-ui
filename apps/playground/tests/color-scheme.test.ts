import { join } from "node:path";
import type { Browser, BrowserContextOptions, Page } from "playwright";
import { describe, expect, inject, test } from "vite-plus/test";
import { schemeValues, tokenValues } from "../../../scripts/tokens";
import { stylePropClass, visibilityClass } from "../../../packages/core/src/style-prop-table";
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
const schemes = ["light", "dark"] as const;
type Scheme = (typeof schemes)[number];
const tokens = tokenValues();
const clientScript = "**/assets/**/*.js";
const builtStylesheet = join(import.meta.dirname, "../../../packages/core/dist/styles.css");
const attributeValues = [undefined, "light", "dark", "auto"] as const;
type AttributeValue = (typeof attributeValues)[number];
const displayClass = stylePropClass("display", "base");
const shownAs = "flex";

function schemeUnder(outer: AttributeValue, inner: AttributeValue, system: Scheme): Scheme {
  const nearest = inner ?? outer ?? "light";
  return nearest === "auto" ? system : nearest;
}

function withScheme(value: AttributeValue): string {
  return value === undefined ? "" : ` ${ownerAttribute}="${value}"`;
}

function nestedSchemes(outer: AttributeValue): string {
  const box = (hides: Scheme, inner: AttributeValue) =>
    `<div data-hides="${hides}" data-inner="${inner}" class="${displayClass} ${visibilityClass(`${hides}Hidden`, true)}" style="--${displayClass}:${shownAs}">box</div>`;
  const sections = attributeValues.map(
    (inner) =>
      `<section${withScheme(inner)}>${schemes.map((hides) => box(hides, inner)).join("")}</section>`,
  );
  return `<!doctype html><html${withScheme(outer)}><head></head><body>${sections.join("")}</body></html>`;
}

function written(token: string, scheme: Scheme): string {
  const values = schemeValues(tokens[token] ?? "");
  if (!values) throw new Error(`${token} is not written as light-dark(<light>, <dark>).`);
  return values[scheme];
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

test("the server writes the page's scheme on <html> and, in <head>, one script with the page's nonce that sets the scheme before the page paints", async () => {
  const response = await fetch(url);
  const nonce = /'nonce-([^']+)'/.exec(response.headers.get(policyHeader) ?? "")?.[1];
  const html = await response.text();
  const [root] = elementsOf(html).filter(({ tag }) => tag === "html");
  const head = html.slice(0, html.indexOf("</head>"));
  const prePaint = [...head.matchAll(/(<script[^>]*>)([^<]*)<\/script>/g)].filter(([, , text]) =>
    text.includes(JSON.stringify(playgroundColorSchemeKey)),
  );

  expect(nonce).toBeDefined();
  expect(valuesOf(root, ownerAttribute)).toEqual([pageColorScheme]);
  expect(prePaint).toHaveLength(1);
  expect(prePaint.map(([, tag]) => valuesOf(elementsOf(tag)[0], "nonce"))).toEqual([[nonce]]);
});

inEveryEngine((browser) => {
  describe.each(schemes)("with the system in the %s scheme", (system) => {
    const other: Scheme = system === "light" ? "dark" : "light";

    test("with scripts off, auto follows the system: the tokens, color-scheme and lightHidden or darkHidden", async () => {
      const { page, close } = await open(browser(), system, { javaScriptEnabled: false });

      expect(await attributeOf(page)).toBe(pageColorScheme);
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

      expect(await chosen(page)).toBe(pageColorScheme);
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
      expect(await chosen(page)).toBe(pageColorScheme);
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

    test("a scheme set, cleared, or cleared with the whole storage on another page of the same origin reaches this one through the storage event, and a change of another key does not", async () => {
      const first = await open(browser(), system);
      const second = await first.page.context().newPage();
      await second.goto(url, { waitUntil: "networkidle" });
      await settledOn(second, system);

      await press(first.page, schemeButtons[other]);
      await settledOn(second, other);
      expect(await chosen(second)).toBe(other);

      const shown = await second
        .getByRole("status", { name: schemeTexts.chosen })
        .evaluateHandle((output) => {
          const texts: (string | null)[] = [];
          new MutationObserver(() => texts.push(output.textContent)).observe(output, {
            characterData: true,
            childList: true,
            subtree: true,
          });
          return texts;
        });
      await first.page.evaluate(
        ([key, value]) => localStorage.setItem(key, value),
        [`${playgroundColorSchemeKey}-of-another-app`, system],
      );
      await press(first.page, schemeButtons.clear);
      await settledOn(second, system);
      expect(await chosen(second)).toBe(pageColorScheme);
      expect(await shown.jsonValue(), "another key's change shows nothing").toEqual([
        pageColorScheme,
      ]);

      await press(first.page, schemeButtons[other]);
      await settledOn(second, other);
      await first.page.evaluate(() => localStorage.clear());
      await settledOn(second, system);
      expect(await chosen(second)).toBe(pageColorScheme);
      await first.close();
    });

    test.each([
      [
        "that throws when it is read",
        () => {
          Object.defineProperty(window, "localStorage", {
            get: () => {
              throw new DOMException("The storage is blocked.", "SecurityError");
            },
          });
        },
      ],
      [
        "whose every method throws",
        () => {
          for (const method of ["getItem", "setItem", "removeItem"] as const) {
            Storage.prototype[method] = () => {
              throw new DOMException("The storage is full.", "QuotaExceededError");
            };
          }
        },
      ],
    ])(
      "with a storage %s, the page still renders the default and each button still switches and clears it",
      async (_, breakTheStorage) => {
        const context = await browser().newContext({ colorScheme: system });
        await context.addInitScript(breakTheStorage);
        const page = await context.newPage();
        const problems: string[] = [];
        page.on("pageerror", (error) => problems.push(String(error)));
        await page.goto(url, { waitUntil: "networkidle" });
        await settledOn(page, system);

        await press(page, schemeButtons[other]);
        await settledOn(page, other);
        await expectTheScheme(page, other);
        await press(page, schemeButtons.clear);
        await settledOn(page, system);
        expect(problems).toEqual([]);
        await context.close();
      },
    );

    test("with the built stylesheet alone, lightHidden and darkHidden follow the nearest data-color-scheme, the light scheme where no ancestor has one, and an element that is shown keeps the display a style prop gives it", async () => {
      const context = await browser().newContext({ colorScheme: system });
      const page = await context.newPage();
      const wrong: string[] = [];
      for (const outer of attributeValues) {
        await page.setContent(nestedSchemes(outer));
        await page.addStyleTag({ path: builtStylesheet });
        const found = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>("[data-hides]")].map((box) => ({
            hides: box.dataset.hides,
            inner: box.dataset.inner,
            display: getComputedStyle(box).display,
          })),
        );
        for (const inner of attributeValues) {
          for (const hides of schemes) {
            const display = found.find(
              (box) => box.hides === hides && box.inner === String(inner),
            )?.display;
            const expected = schemeUnder(outer, inner, system) === hides ? "none" : shownAs;
            if (display !== expected) {
              wrong.push(
                `${hides}Hidden inside ${inner} inside ${outer}: display is ${display}, not ${expected}`,
              );
            }
          }
        }
      }

      expect(wrong).toEqual([]);
      await context.close();
    });

    test("with the built stylesheet alone, a consumer's override of a colour token on :root is reset inside a nested scheme, and reaches it once the consumer sets it on [data-color-scheme] too", async () => {
      const context = await browser().newContext({ colorScheme: system });
      const page = await context.newPage();
      const token = "--solix-color-primary";
      const overridden = "rgb(0, 128, 0)";
      const text = (id: string) => `<p id="${id}" style="color:var(${token})">text</p>`;
      const pageWith = (selector: string) =>
        `<!doctype html><html${withScheme(system)}><head><style>${selector}{${token}:${overridden}}</style></head><body>${text("outer")}<section${withScheme(other)}>${text("inner")}</section></body></html>`;
      const colours = async (selector: string) => {
        await page.setContent(pageWith(selector));
        await page.addStyleTag({ path: builtStylesheet });
        return {
          outer: await computed(page.locator("#outer"), "color"),
          inner: await computed(page.locator("#inner"), "color"),
        };
      };

      expect(await colours(":root")).toEqual({
        outer: overridden,
        inner: await colourOf(page, written(token, other)),
      });
      expect(await colours(`:root, [${ownerAttribute}]`)).toEqual({
        outer: overridden,
        inner: overridden,
      });
      await context.close();
    });

    test("the scheme on <html> is written by the pre-paint script and then once by the provider, both times the stored scheme, or with nothing stored the system's, and never the default between them", async () => {
      for (const stored of [other, undefined]) {
        const context = await browser().newContext({ colorScheme: system });
        await context.addInitScript((name) => {
          const valuesBeforeEachWrite: (string | null)[] = [];
          new MutationObserver((records) => {
            for (const { target, oldValue } of records) {
              if (target === document.documentElement) valuesBeforeEachWrite.push(oldValue);
            }
          }).observe(document, {
            subtree: true,
            attributeFilter: [name],
            attributeOldValue: true,
          });
          Object.assign(window, { valuesBeforeEachWrite });
        }, ownerAttribute);
        if (stored !== undefined) {
          await context.addInitScript(
            ([key, value]) => localStorage.setItem(key, value),
            [playgroundColorSchemeKey, stored],
          );
        }
        const page = await context.newPage();
        await page.goto(url, { waitUntil: "networkidle" });
        const scheme = stored ?? system;

        await expect
          .poll(() =>
            page.evaluate(
              (name) => [
                ...Reflect.get(window, "valuesBeforeEachWrite").slice(1),
                document.documentElement.getAttribute(name),
              ],
              ownerAttribute,
            ),
          )
          .toEqual([scheme, scheme]);
        await context.close();
      }
    });

    test("a provider given forceColorScheme and getRootElement writes the forced scheme on its own element, takes no manager, so its controls neither change, store nor clear a scheme, and leaves <html> to the page's provider", async () => {
      const { page, close } = await open(browser(), system, { stored: other });
      await settledOn(page, other);
      const forced = page.getByRole("region", { name: forcedSection });
      const input = forced.getByRole("textbox", { name: schemeTexts.forcedInput });

      await expect
        .poll(() => forced.evaluate((node, name) => node.getAttribute(name), ownerAttribute))
        .toBe("dark");
      expect(await chosen(page, schemeTexts.forcedChosen)).toBe("dark");
      expect(
        await computed(forced.getByText(schemeTexts.forcedShownInDark), "display"),
        "lightHidden follows the section's dark scheme, not the page's, and keeps its display",
      ).toBe("flex");
      expect(await forced.getByText(schemeTexts.forcedShownInLight).isVisible()).toBe(false);
      expect(await computed(input, "background-color")).toBe(
        await colourOf(page, written("--solix-color-body", "dark")),
      );
      expect(await attributeOf(page)).toBe(other);

      for (const control of ["forcedLight", "forcedToggle", "forcedClear"] as const) {
        await forced.getByRole("button", { name: schemeButtons[control] }).click();
      }
      expect(await storedIn(page)).toBe(other);
      expect(await chosen(page)).toBe(other);
      expect(await attributeOf(page)).toBe(other);
      expect(await chosen(page, schemeTexts.forcedChosen)).toBe("dark");
      expect(await forced.evaluate((node, name) => node.getAttribute(name), ownerAttribute)).toBe(
        "dark",
      );
      expect(
        await page.evaluate(() => Object.fromEntries(Object.entries(localStorage))),
        "a forced provider stores and clears nothing",
      ).toEqual({ [playgroundColorSchemeKey]: other });
      await close();
    });
  });
});
