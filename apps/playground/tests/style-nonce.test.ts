import { join } from "node:path";
import type { Browser, Page } from "playwright";
import { describe, expect, inject, test } from "vite-plus/test";
import { behaviourSdkHiddenRule } from "../../../packages/core/build-pipeline.mjs";
import { libraryStyleMark } from "../../../packages/core/src/style-prop-table";
import { expectedValues } from "../../../scripts/expected-values";
import { elementsOf, valuesOf } from "../../../packages/core/tests/markup";
import { policyHeader } from "#/src/middleware.ts";
import { themedByTheProvider, themedSpacing, themeNames } from "#/src/sections/theme-setups.ts";
import { opened } from "#/tests/support/opening.ts";
import { computed, inEveryEngine } from "#/tests/support/playground.ts";

const url = inject("playgroundUrl");
const policyNonce = /'nonce-([^']+)'/;
const metaWithANonce = /<meta [^>]*\bnonce="[^"]*"[^>]*>/g;
const sdkHiddenRule = behaviourSdkHiddenRule(join(import.meta.dirname, "../../../packages/core"));
const spacingToken = "--solix-spacing-md";

function nonceOf(policy: string | null | undefined): string {
  const nonce = policy ? policyNonce.exec(policy)?.[1] : undefined;
  if (nonce === undefined) {
    throw new Error(
      `apps/playground/src/middleware.ts: send a ${policyHeader} header whose style-src names the page's nonce, not ${String(policy)}.`,
    );
  }
  return nonce;
}

test("the server gives each page a nonce of its own, and every <style> in its markup carries it", async () => {
  const served = await Promise.all(
    [url, url].map(async (address) => {
      const response = await fetch(address);
      return { nonce: nonceOf(response.headers.get(policyHeader)), html: await response.text() };
    }),
  );

  expect(new Set(served.map(({ nonce }) => nonce)).size).toBe(served.length);
  for (const { nonce, html } of served) {
    const styles = elementsOf(html).filter(({ tag }) => tag === "style");

    expect(styles.map((style) => valuesOf(style, "nonce"))).toEqual(styles.map(() => [nonce]));
    expect(
      styles.filter((style) => valuesOf(style, libraryStyleMark).length > 0).length,
    ).toBeGreaterThan(0);
    expect(html).toContain(`[${themedByTheProvider}]{`);
  }
});

type Served = { javaScriptEnabled: boolean; withoutTheNonceMeta: boolean };

const howItIsServed: [label: string, served: Served][] = [
  ["with scripts off", { javaScriptEnabled: false, withoutTheNonceMeta: false }],
  ["hydrated", { javaScriptEnabled: true, withoutTheNonceMeta: false }],
  [
    "hydrated, with no meta in its head that carries the nonce",
    { javaScriptEnabled: true, withoutTheNonceMeta: true },
  ],
];

type FoundStyle = { nonce: string; byTheLibrary: boolean; text: string };

async function openServed(
  browser: Browser,
  { javaScriptEnabled, withoutTheNonceMeta }: Served,
): Promise<{ page: Page; nonce: string; refused: string[]; close: () => Promise<void> }> {
  const context = await browser.newContext({ javaScriptEnabled });
  const page = await context.newPage();
  const refused: string[] = [];
  let nonce = "";
  await page.exposeFunction("reportRefusal", (refusal: string) => refused.push(refusal));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      const report = (globalThis as unknown as { reportRefusal: (refusal: string) => void })
        .reportRefusal;
      report(`${event.effectiveDirective}: ${event.sample || event.blockedURI}`);
    });
  });
  await page.route(url, async (route) => {
    const response = await route.fetch();
    nonce = nonceOf(response.headers()[policyHeader.toLowerCase()]);
    const body = await response.text();
    await route.fulfill({
      response,
      body: withoutTheNonceMeta ? body.replaceAll(metaWithANonce, "") : body,
    });
  });
  await opened(page, url, javaScriptEnabled ? "hydrated" : "load");
  return { page, nonce, refused, close: () => context.close() };
}

function stylesOn(page: Page): Promise<FoundStyle[]> {
  return page.evaluate(
    (byTheLibrary) =>
      [...document.querySelectorAll("style")].map((style) => ({
        nonce: style.nonce ?? "",
        byTheLibrary: style.hasAttribute(byTheLibrary),
        text: style.textContent ?? "",
      })),
    libraryStyleMark,
  );
}

function spacingOf(page: Page, text: string): Promise<string> {
  return page
    .getByText(text, { exact: true })
    .evaluate((node, name) => getComputedStyle(node).getPropertyValue(name).trim(), spacingToken);
}

inEveryEngine((browser) => {
  describe.each(howItIsServed)("a page %s", (_, served) => {
    test("every <style> on it carries the page's nonce, the policy refuses none, and the theme stays under its selector, where it sets a Box's padding", async () => {
      const { page, nonce, refused, close } = await openServed(browser(), served);
      const styles = await stylesOn(page);
      const themed = await spacingOf(page, themeNames.themed);
      const untouched = await spacingOf(page, themeNames.untouched);
      const padding = {
        themed: await computed(page.getByText(themeNames.themed, { exact: true }), "padding-top"),
        untouched: await computed(
          page.getByText(themeNames.untouched, { exact: true }),
          "padding-top",
        ),
      };
      const expected = await expectedValues(page);
      await close();

      expect(styles.map((style) => style.nonce)).toEqual(styles.map(() => nonce));
      expect(
        styles.filter((style) => style.byTheLibrary && style.text.includes(themedByTheProvider)),
      ).toHaveLength(1);
      expect(styles.some((style) => style.text === sdkHiddenRule)).toBe(served.javaScriptEnabled);
      if (served.javaScriptEnabled) expect(refused).toEqual([]);
      expect(themed).toBe(themedSpacing.md);
      expect(untouched).not.toBe(themed);
      expect(padding.themed, "p=md under the provider's selector reads the theme's spacing").toBe(
        expected("themedSpacingMd"),
      );
      expect(padding.untouched, "p=md outside it keeps the library's spacing").toBe(
        expected("--solix-spacing-md"),
      );
    });
  });
});
