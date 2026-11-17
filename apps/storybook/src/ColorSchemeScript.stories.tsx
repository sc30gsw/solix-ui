import { ColorSchemeScript } from "@solix/core";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect } from "storybook/test";

const storageKey = "story-color-scheme";

const meta = {
  component: ColorSchemeScript,
  args: { localStorageKey: storageKey, nonce: "story-nonce" },
} satisfies Meta<typeof ColorSchemeScript>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ReadsTheStoredScheme: Story = {
  play: async ({ canvasElement }) => {
    const script = canvasElement.querySelector("script");
    await expect(script?.textContent).toContain(JSON.stringify(storageKey));
    await expect(script?.nonce).toBe("story-nonce");
  },
};

export const Forced: Story = {
  args: { forceColorScheme: "dark" },
  play: async ({ canvasElement }) => {
    const script = canvasElement.querySelector("script");
    await expect(script?.textContent).not.toContain("localStorage");
    await expect(script?.textContent).toContain('"dark"');
  },
};
