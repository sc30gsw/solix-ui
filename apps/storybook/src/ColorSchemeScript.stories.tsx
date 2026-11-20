import { ColorSchemeScript } from "@solix/core";
import { argTypesOf } from "virtual:story-controls";
import { expect } from "storybook/test";
import type { ComponentMeta, ComponentStory } from "#/story-meta.ts";

const storageKey = "story-color-scheme";

const meta = {
  component: ColorSchemeScript,
  argTypes: argTypesOf(ColorSchemeScript),
  args: { localStorageKey: storageKey, nonce: "story-nonce" },
} satisfies ComponentMeta<typeof ColorSchemeScript>;

export default meta;

type Story = ComponentStory<typeof meta>;

export const NamesItsStorageKey: Story = {
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
