import { dirname, join } from "node:path";
import solid from "@solidjs/vite-plugin";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { defineConfig } from "vite-plus";
import { browserInEveryEngine } from "../../scripts/browser-instances.ts";
import { allowedRuntimeDependencyNames } from "../../scripts/runtime-dependencies.ts";
import "#/story-color-scheme.ts";
import type { StoriesServer } from "#/tests/support/test-servers.ts";

const schemeOfEachStory = join(import.meta.dirname, "story-color-scheme.setup.ts");

const preBundledForStories = ["@stylexjs/stylex"];
const storyTimeout = 30_000;

export function storiesProject(
  { project, port, colorScheme }: StoriesServer,
  configDir: string,
  groupOrder = 0,
) {
  return defineConfig({
    root: dirname(configDir),
    plugins: [solid(), storybookTest({ configDir })],
    optimizeDeps: {
      include: preBundledForStories,
      exclude: allowedRuntimeDependencyNames(),
    },
    test: {
      name: project,
      provide: { storyColorScheme: colorScheme },
      setupFiles: [schemeOfEachStory],
      testTimeout: storyTimeout,
      hookTimeout: storyTimeout,
      api: { port, strictPort: true },
      sequence: { groupOrder },
      browser: browserInEveryEngine(),
    },
  });
}
