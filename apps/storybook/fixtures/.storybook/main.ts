import type { StorybookConfig } from "storybook-solidjs-vite";
import config from "#/.storybook/main.ts";

const brokenStoriesConfig: StorybookConfig = { ...config, stories: ["../*.stories.tsx"] };

export default brokenStoriesConfig;
