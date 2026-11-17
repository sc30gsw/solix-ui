import type { StorybookConfig } from "storybook-solidjs-vite";

const config: StorybookConfig = {
  framework: { name: "storybook-solidjs-vite", options: { docgen: false } },
  stories: ["../src/**/*.stories.tsx"],
  addons: ["@storybook/addon-a11y", "@storybook/addon-vitest"],
  core: { disableTelemetry: true },
};

export default config;
