import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser, Page } from "playwright";
import type { StoryIndexEntry } from "storybook/internal/types";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { storybookAppManifest } from "../../../scripts/release-sources.ts";
import { manifestAt } from "../../../scripts/repository.ts";
import { inEveryEngine } from "../../../tests/support/served-app.ts";
import { childRunMargin, runVp } from "#/tests/support/child-runs.ts";
import { serveDirectory } from "#/tests/support/static-server.ts";
import { collectTelemetry, telemetryUrlVariable } from "#/tests/support/telemetry-collector.ts";
import { staticStorybookDirectory } from "#/tests/support/test-servers.ts";

const staticBuildScript = "build-storybook";
const scriptsRunUnderTheCollector = [staticBuildScript];
const buildTimeout = 300_000;
const interfaceTimeout = 90_000;
const panelTimeout = 60_000;
const componentAndStorySeparator = "--";
const playFunctionTag = "play-fn";
const previewFrame = "#storybook-preview-iframe";
const storyRoot = "#storybook-root";
const idleCallbacks = ["requestIdleCallback", "cancelIdleCallback"];
const storyWithATextArg = "button--default";
const textArg = "children";
const typedArg = "Saved again";

const telemetry = collectTelemetry();
const site = serveDirectory(staticStorybookDirectory);
let build: { exitCode: number | null; output: string } = { exitCode: null, output: "" };
let stories: StoryIndexEntry[] = [];

function builtStories(): StoryIndexEntry[] {
  const index = JSON.parse(readFileSync(join(staticStorybookDirectory, "index.json"), "utf8")) as {
    entries: Record<string, StoryIndexEntry>;
  };
  return Object.values(index.entries).filter(({ type }) => type === "story");
}

function componentIdOf({ id }: StoryIndexEntry): string {
  return id.slice(0, id.indexOf(componentAndStorySeparator));
}

async function panelText(page: Page): Promise<string> {
  return (await page.getByRole("tabpanel").allInnerTexts()).join("\n");
}

beforeAll(async () => {
  build = await runVp(
    join(import.meta.dirname, ".."),
    ["run", staticBuildScript],
    { [telemetryUrlVariable]: telemetry.url },
    buildTimeout,
  );
  stories = build.exitCode === 0 ? builtStories() : [];
}, buildTimeout + childRunMargin);

test("the scripts of the Storybook package are the ones this test runs under the telemetry collector", () => {
  expect(Object.keys(manifestAt(storybookAppManifest).scripts ?? {})).toEqual(
    scriptsRunUnderTheCollector,
  );
});

test("the static build succeeds and sends no Storybook telemetry", () => {
  expect(build.exitCode, build.output).toBe(0);
  expect(stories.length).toBeGreaterThan(0);
  expect(telemetry.received()).toEqual([]);
});

type InterfaceSetup = { name: string; withoutIdleCallbacks: boolean };

function removeIdleCallbacks(names: readonly string[]): void {
  for (const name of names) {
    Reflect.deleteProperty(Window.prototype, name);
    Reflect.deleteProperty(window, name);
  }
}

function checkTheInterface(
  browser: () => Browser,
  { name, withoutIdleCallbacks }: InterfaceSetup,
): void {
  describe(name, () => {
    let page: Page;
    const consoleErrors: string[] = [];

    beforeAll(async () => {
      const context = await browser().newContext({ viewport: { width: 1400, height: 900 } });
      if (withoutIdleCallbacks) await context.addInitScript(removeIdleCallbacks, idleCallbacks);
      page = await context.newPage();
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => consoleErrors.push(String(error)));
      await page.goto(site.url, { waitUntil: "load" });
    }, interfaceTimeout);

    afterAll(async () => {
      await page.context().close();
    });

    test(
      "the sidebar lists every component the story index holds",
      async () => {
        const components = [...new Set(stories.map(componentIdOf))];
        await page.locator(`[data-item-id="${components[0]}"]`).waitFor();
        const listed = await page
          .locator('[data-nodetype="component"]')
          .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-item-id")));

        expect(new Set(listed)).toEqual(new Set(components));
      },
      interfaceTimeout,
    );

    test(
      "a story picked in the sidebar renders in the preview, and its play function passes in the interactions panel",
      async () => {
        const story = stories.find(({ tags = [] }) => tags.includes(playFunctionTag));
        if (story === undefined) throw new Error("No story in the index has a play function.");
        await page.locator(`[data-item-id="${componentIdOf(story)}"]`).click();
        await page.locator(`[data-item-id="${story.id}"]`).click();

        await expect
          .poll(() => new URL(page.url()).searchParams.get("path"))
          .toBe(`/story/${story.id}`);
        await expect
          .poll(() => page.frameLocator(previewFrame).locator(storyRoot).innerHTML(), {
            timeout: panelTimeout,
          })
          .not.toBe("");
        await page.getByRole("tab", { name: /interactions/i }).click();
        await expect
          .poll(() => panelText(page), { timeout: panelTimeout })
          .toMatch(/pass[\s\S]*interaction steps/i);
      },
      interfaceTimeout,
    );

    test(
      "the accessibility panel opens and reports no violation of the story picked in the sidebar",
      async () => {
        await page.getByRole("tab", { name: /accessibility/i }).click();

        await expect
          .poll(() => panelText(page), { timeout: panelTimeout })
          .toMatch(/violations\s*0[\s\S]*passes\s*[1-9]/i);
      },
      interfaceTimeout,
    );

    test(
      "a story's text arg changed through the controls panel reaches the preview",
      async () => {
        await page.goto(`${site.url}?path=/story/${storyWithATextArg}`, { waitUntil: "load" });
        await page.getByRole("tab", { name: /controls/i }).click();
        const control = page.locator(`#control-${textArg}`);
        await control.fill("");
        await control.pressSequentially(typedArg);

        await expect
          .poll(() => page.frameLocator(previewFrame).locator(storyRoot).innerText(), {
            timeout: panelTimeout,
          })
          .toBe(typedArg);
      },
      interfaceTimeout,
    );

    test("the interface has requestIdleCallback and cancelIdleCallback", async () => {
      expect(
        await page.evaluate(
          (names) => names.map((name) => typeof Reflect.get(window, name)),
          idleCallbacks,
        ),
      ).toEqual(idleCallbacks.map(() => "function"));
    });

    test("the interface reports no console error", () => {
      expect(consoleErrors).toEqual([]);
    });
  });
}

inEveryEngine((browser) => {
  checkTheInterface(browser, {
    name: "Storybook's own interface, built",
    withoutIdleCallbacks: false,
  });
  checkTheInterface(browser, {
    name: "Storybook's own interface, built, opened where the engine has no idle callbacks",
    withoutIdleCallbacks: true,
  });
});
