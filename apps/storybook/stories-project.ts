import solid from "@solidjs/vite-plugin";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { defineConfig } from "vite-plus";
import { browserInEveryEngine } from "../../scripts/browser-instances.ts";
import { allowedRuntimeDependencyNames } from "../../scripts/runtime-dependencies.ts";

type StoriesServer = { project: string; port: number };

const preBundledForStories = ["@stylexjs/stylex"];
const storyTimeout = 30_000;

export function storiesProject({ project, port }: StoriesServer, configDir: string) {
  return defineConfig({
    plugins: [solid(), storybookTest({ configDir })],
    optimizeDeps: {
      include: preBundledForStories,
      exclude: allowedRuntimeDependencyNames(),
    },
    test: {
      name: project,
      testTimeout: storyTimeout,
      hookTimeout: storyTimeout,
      api: { port, strictPort: true },
      browser: browserInEveryEngine(),
    },
  });
}
