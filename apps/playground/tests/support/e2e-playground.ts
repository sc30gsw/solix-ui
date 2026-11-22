import { type Browser, test as base } from "@e2e-dev/web";
import type { App } from "e2e";
import { type Expected, expectedValuesRead } from "../../../../scripts/expected-values";
import { hydratedMark } from "#/src/hydrated-mark.ts";
import { hydrationTimeout, pageDidNotBecomeReady } from "#/tests/support/opening.ts";

const consoleProblemsKey = "__solixConsoleProblems";

function recordConsoleProblems(key: string): void {
  const problems: string[] = [];
  const sink = window.console;
  Object.defineProperty(window, key, { value: problems });
  for (const [method, type] of [
    ["error", "error"],
    ["warn", "warning"],
  ] as const) {
    const original = sink[method];
    sink[method] = (...data: unknown[]) => {
      problems.push(`${type}: ${data.map(String).join(" ")}`);
      original.apply(sink, data);
    };
  }
  window.addEventListener(
    "error",
    (event) => {
      problems.push(
        event.target instanceof Element
          ? `error: ${event.target.outerHTML} did not load`
          : `pageerror: ${String(event.error ?? event.message)}`,
      );
    },
    true,
  );
  window.addEventListener("unhandledrejection", (event) => {
    problems.push(`pageerror: ${String(event.reason)}`);
  });
  document.addEventListener("securitypolicyviolation", (event) => {
    problems.push(`error: ${event.violatedDirective} refused ${event.blockedURI || "inline"}`);
  });
}

export function consoleProblems(browser: Browser): Promise<string[]> {
  return browser.evaluate((key) => {
    const kept: unknown = Reflect.get(window, key);
    return Array.isArray(kept)
      ? kept.map(String)
      : ["the console recorder did not run before the page's own scripts"];
  }, consoleProblemsKey);
}

export async function openedHydrated(app: App, browser: Browser): Promise<void> {
  await browser.addInitScript(recordConsoleProblems, consoleProblemsKey);
  await app.open("/");
  try {
    await browser
      .locator(`html[${hydratedMark}]`)
      .waitFor({ state: "attached", timeout: hydrationTimeout });
  } catch (cause) {
    const said = await consoleProblems(browser);
    throw new Error(
      `${pageDidNotBecomeReady}: its client script has not marked <html> with ${hydratedMark} within ${hydrationTimeout} ms, so it has not hydrated the page. The page said: ${said.join(" | ") || "nothing"}`,
      { cause },
    );
  }
}

function styleIn(browser: Browser, selector: string, property: string): Promise<string> {
  return browser.evaluate(
    ([target, name]) => {
      const found = document.querySelectorAll(target);
      if (found.length !== 1) {
        throw new Error(`${target} matches ${found.length} elements, not one.`);
      }
      return getComputedStyle(found[0]).getPropertyValue(name);
    },
    [selector, property],
  );
}

export function labelled(name: string): string {
  return `[aria-label="${name}"]`;
}

export type HydratedPlayground = {
  expected: Expected;
  styleOf: (selector: string, property: string) => Promise<string>;
};

export const test = base.extend<{ playground: HydratedPlayground }>({
  playground: async ({ app, browser }, use) => {
    await openedHydrated(app, browser);
    const expected = await expectedValuesRead((probe, input) => browser.evaluate(probe, input), {
      sentinels: true,
    });
    await use({ expected, styleOf: (selector, property) => styleIn(browser, selector, property) });
  },
});
