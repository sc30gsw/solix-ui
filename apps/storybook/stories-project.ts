import { dirname } from "node:path";
import solid from "@solidjs/vite-plugin";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { defineConfig } from "vite-plus";
import { browserInEveryEngine } from "../../scripts/browser-instances.ts";
import { allowedRuntimeDependencyNames } from "../../scripts/runtime-dependencies.ts";

type StoriesServer = { project: string; port: number; colorScheme: "light" | "dark" };

export const storyColorSchemeVariable = "STORY_COLOR_SCHEME";

const preBundledForStories = ["@stylexjs/stylex"];
const storyTimeout = 30_000;

export function storiesProject({ project, port, colorScheme }: StoriesServer, configDir: string) {
  return defineConfig({
    root: dirname(configDir),
    plugins: [solid(), storybookTest({ configDir })],
    optimizeDeps: {
      include: preBundledForStories,
      exclude: allowedRuntimeDependencyNames(),
    },
    test: {
      name: project,
      env: { [storyColorSchemeVariable]: colorScheme },
      testTimeout: storyTimeout,
      hookTimeout: storyTimeout,
      api: { port, strictPort: true },
      browser: browserInEveryEngine(),
    },
  });
}
