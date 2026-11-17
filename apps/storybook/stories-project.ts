import solid from "@solidjs/vite-plugin";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";
import type { BrowserInstanceOption } from "vite-plus/test/node";
import { enginesToVerify } from "../../scripts/browser-engines.mjs";
import { allowedRuntimeDependencyNames } from "../../scripts/runtime-dependencies.ts";

const preBundledForStories = ["@stylexjs/stylex"];

export type StoriesRun = { project: string; port: number };

export function storiesProject({ project, port }: StoriesRun, configDir: string) {
  return defineConfig({
    plugins: [solid(), storybookTest({ configDir })],
    optimizeDeps: {
      include: preBundledForStories,
      exclude: allowedRuntimeDependencyNames(),
    },
    test: {
      name: project,
      api: { port, strictPort: true },
      browser: {
        enabled: true,
        headless: true,
        provider: playwright(),
        screenshotFailures: false,
        get instances() {
          return enginesToVerify().map((engine) => ({
            browser: engine as BrowserInstanceOption["browser"],
          }));
        },
      },
    },
  });
}
