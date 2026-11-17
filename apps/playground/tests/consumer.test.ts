import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, inject, test } from "vite-plus/test";
import { LIBRARY_CASCADE_LAYER } from "../../../packages/core/build-pipeline.mjs";
import { builtComponents, rootPart, stableClass } from "../../../packages/core/tests/built-library";
import {
  appDirectory,
  computed,
  inEveryEngine,
  openPage,
  type OpenPage,
} from "#/tests/support/playground.ts";

const url = inject("playgroundUrl");

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

  test("gets server-rendered markup whose parts carry their stable classes, and a closed dialog", async () => {
    const html = await (await fetch(url)).text();

    expect(html).toMatch(
      new RegExp(`<summary[^>]*class="[^"]*${stableClass("Disclosure", "summary")}`),
    );
    expect(html).toMatch(
      new RegExp(`<div[^>]*class="[^"]*${stableClass("Disclosure", "content")}`),
    );
    expect(html).toMatch(
      new RegExp(`<dialog(?![^>]*\\sopen)[^>]*class="[^"]*${stableClass("Modal", rootPart)}`),
    );
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

inEveryEngine((browser) => {
  describe("in the hydrated page", () => {
    let opened: OpenPage;

    beforeAll(async () => {
      opened = await openPage(browser(), url);
    });

    afterAll(async () => {
      await opened.close();
    });

    test("hydration reports no console errors or warnings", () => {
      expect(opened.consoleProblems).toEqual([]);
    });

    test("a class and an attribute that change after the first render reach each component's root, and a class that classes names reaches its part", async () => {
      const { page, expected } = opened;
      const emphasise = page.getByRole("button", { name: "Emphasise" });
      const follower = page.locator("details").filter({ hasText: "Follows the Emphasise button" });
      const followerSummary = follower.locator("summary");
      expect(await computed(emphasise, "background-color")).toBe(expected("--solix-color-primary"));
      expect(await emphasise.getAttribute("aria-pressed")).toBe("false");
      expect(await computed(follower, "outline-style")).toBe("none");
      expect(await computed(followerSummary, "background-color")).toBe(
        expected("--solix-color-surface"),
      );

      await emphasise.click();

      await expect.poll(() => computed(emphasise, "background-color")).toBe(expected("danger"));
      expect(await emphasise.getAttribute("aria-pressed")).toBe("true");
      expect(await computed(follower, "outline-style")).toBe("solid");
      expect(
        await computed(followerSummary, "background-color"),
        "the class that classes.summary now names",
      ).toBe(expected("danger"));

      await emphasise.click();

      await expect
        .poll(() => computed(emphasise, "background-color"))
        .toBe(expected("--solix-color-primary"));
      expect(await computed(follower, "outline-style")).toBe("none");
      expect(await computed(followerSummary, "background-color")).toBe(
        expected("--solix-color-surface"),
      );
    });

    test("a consumer's ref receives the root element of every component", async () => {
      const received = await opened.page.evaluate(() =>
        [...document.querySelectorAll("[data-ref]")].map((node) => ({
          component: node.getAttribute("data-ref"),
          classes: [...node.classList],
        })),
      );

      for (const name of builtComponents) {
        const rootClass = stableClass(name, rootPart);
        expect(
          received
            .filter(({ component }) => component === name)
            .map(({ classes }) => classes.includes(rootClass)),
          `${name}: render it in the app, and give the consumer's ref the element that carries ${rootClass}, once, next to any ref of its own. apps/playground/src/sections pass ref={refOf("${name}")} to one <${name}>, which marks the node it receives with data-ref.`,
        ).toEqual([true]);
      }
    });

    test("a consumer rethemes a subtree by overriding a public token", async () => {
      expect(await computed(opened.page.getByTestId("themed"), "background-color")).toBe(
        opened.expected("brandGreen"),
      );
    });
  });
});
