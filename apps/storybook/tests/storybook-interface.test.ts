import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { inEveryEngine } from "../../../tests/support/served-app.ts";
import { storybookDirectory } from "#/tests/support/stories.ts";
import { type StaticServer, serveDirectory } from "#/tests/support/static-server.ts";
import { collectTelemetry, telemetryUrlVariable } from "#/tests/support/telemetry-collector.ts";
import { interfaceTelemetryPort, staticStorybookPort } from "#/tests/support/test-servers.ts";
import { type Finished, runVp } from "#/tests/support/vitest-run.ts";

type IndexEntry = { id: string; type: string; tags: string[] };

type ScriptRun = Finished & { script: string };

const staticBuild = join(storybookDirectory, "dist");
const buildTimeout = 300_000;
const interfaceTimeout = 90_000;
const panelTimeout = 60_000;
const storyAndComponentSeparator = "--";
const playFunctionTag = "play-fn";
const previewFrame = "#storybook-preview-iframe";
const storyRoot = "#storybook-root";

const scripts = Object.keys(
  (
    JSON.parse(readFileSync(join(storybookDirectory, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    }
  ).scripts ?? {},
);
const telemetry = collectTelemetry(interfaceTelemetryPort);
const scriptRuns: ScriptRun[] = [];
let server: StaticServer | undefined;

async function runScript(script: string): Promise<ScriptRun> {
  return {
    script,
    ...(await runVp(storybookDirectory, ["run", script], {
      [telemetryUrlVariable]: telemetry.url,
    })),
  };
}

async function panelText(page: Page): Promise<string> {
  return (await page.getByRole("tabpanel").allInnerTexts()).join("\n");
}

function storyIndex(): IndexEntry[] {
  const index = JSON.parse(readFileSync(join(staticBuild, "index.json"), "utf8")) as {
    entries: Record<string, IndexEntry>;
  };
  return Object.values(index.entries).filter(({ type }) => type === "story");
}

function componentIdOf({ id }: IndexEntry): string {
  return id.slice(0, id.indexOf(storyAndComponentSeparator));
}

beforeAll(async () => {
  for (const script of scripts) scriptRuns.push(await runScript(script));
  server = await serveDirectory(staticBuild, staticStorybookPort);
}, buildTimeout);

afterAll(async () => {
  await server?.close();
});

test("every script of the Storybook package finishes, the static build among them, and none sends Storybook telemetry", () => {
  expect(scripts.length).toBeGreaterThan(0);
  expect(
    scriptRuns
      .filter(({ exitCode }) => exitCode !== 0)
      .map(({ script, output }) => ({ script, output })),
  ).toEqual([]);
  expect(storyIndex().length).toBeGreaterThan(0);
  expect(telemetry.received()).toEqual([]);
});

inEveryEngine((browser) => {
  describe("Storybook's own interface, built", () => {
    let page: Page;
    const consoleErrors: string[] = [];

    beforeAll(async () => {
      page = await browser().newPage({ viewport: { width: 1400, height: 900 } });
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => consoleErrors.push(String(error)));
      await page.goto(server?.url ?? "", { waitUntil: "load" });
    }, interfaceTimeout);

    afterAll(async () => {
      await page.close();
    });

    test(
      "the sidebar lists every component the story index holds",
      async () => {
        const components = [...new Set(storyIndex().map(componentIdOf))];
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
        const story = storyIndex().find(({ tags }) => tags.includes(playFunctionTag));
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
          .toMatch(/PASS[\s\S]*Interaction steps/);
      },
      interfaceTimeout,
    );

    test(
      "the accessibility panel opens and reports no violation of the story",
      async () => {
        await page.getByRole("tab", { name: /accessibility/i }).click();

        await expect
          .poll(() => panelText(page), { timeout: panelTimeout })
          .toMatch(/Violations\s*0[\s\S]*Passes\s*[1-9]/);
      },
      interfaceTimeout,
    );

    test("the interface reports no console error", () => {
      expect(consoleErrors).toEqual([]);
    });
  });
});
