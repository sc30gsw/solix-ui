import solid from "@solidjs/vite-plugin";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";
import type { BrowserInstanceOption } from "vite-plus/test/node";
import { allowedRuntimeDependencyNames } from "../../scripts/runtime-dependencies.ts";

const localChromium = process.env.SPIKE_CHROMIUM;
const engines = process.env.SPIKE_ENGINE
  ? [process.env.SPIKE_ENGINE]
  : process.env.CI
    ? ["chromium", "firefox", "webkit"]
    : ["chromium"];

export default defineConfig({
  plugins: [solid()],
  optimizeDeps: { include: ["@stylexjs/stylex"], exclude: allowedRuntimeDependencyNames() },
  test: {
    projects: [
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: ".storybook",
            tags: process.env.SPIKE_BREAKS
              ? { include: ["spike-breaks"] }
              : { exclude: ["spike-breaks"] },
          }),
        ],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(
              localChromium ? { launchOptions: { executablePath: localChromium } } : {},
            ),
            screenshotFailures: false,
            instances: engines.map((browser) => ({
              browser: browser as BrowserInstanceOption["browser"],
            })),
          },
        },
      },
    ],
  },
});
