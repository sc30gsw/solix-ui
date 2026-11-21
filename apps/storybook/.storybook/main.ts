import type { StorybookConfig } from "storybook-solidjs-vite";
import { storyControls } from "../../../scripts/story-controls.ts";

const config: StorybookConfig = {
  framework: { name: "storybook-solidjs-vite", options: { docgen: false } },
  stories: ["../src/**/*.stories.tsx"],
  addons: ["@storybook/addon-a11y", "@storybook/addon-vitest"],
  core: { disableTelemetry: true },
  viteFinal: (viteConfig) => ({
    ...viteConfig,
    plugins: [...(viteConfig.plugins ?? []), storyControls()],
  }),
};

export default config;
