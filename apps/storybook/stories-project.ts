import { dirname, join } from "node:path";
import solid from "@solidjs/vite-plugin";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { defineConfig } from "vite-plus";
import { browserInEveryEngine } from "../../scripts/browser-instances.ts";
import { allowedRuntimeDependencyNames } from "../../scripts/runtime-dependencies.ts";
import "#/story-color-scheme.ts";
import type { StoriesServer } from "#/tests/support/test-servers.ts";
import { instrumentedLibrary } from "#/instrumented-library.ts";
import { recordStoryCommand } from "#/story-records-command.ts";
import { anyFreePort } from "../../tests/support/server-process.ts";

const schemeOfEachStory = join(import.meta.dirname, "story-color-scheme.setup.ts");
const recordOfEachStory = join(import.meta.dirname, "story-records.setup.ts");

const preBundledForStories = ["@stylexjs/stylex"];
const storyTimeout = 30_000;

export function storiesProject(
  { project, colorScheme }: StoriesServer,
  configDir: string,
  storyRecords: string,
) {
  return defineConfig({
    root: dirname(configDir),
    plugins: [solid(), storybookTest({ configDir }), instrumentedLibrary()],
    optimizeDeps: {
      include: preBundledForStories,
      exclude: allowedRuntimeDependencyNames(),
    },
    test: {
      name: project,
      provide: { storyColorScheme: colorScheme },
      setupFiles: [schemeOfEachStory, recordOfEachStory],
      testTimeout: storyTimeout,
      hookTimeout: storyTimeout,
      api: { port: anyFreePort, strictPort: true },
      browser: Object.assign(browserInEveryEngine(), {
        commands: { recordStory: recordStoryCommand(storyRecords) },
      }),
    },
  });
}
