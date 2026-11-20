import { ColorSchemeScript } from "@solix/core";
import { argTypesOf } from "virtual:story-controls";
import { expect } from "storybook/test";
import { everyValueOf } from "#/every-value.tsx";
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

export const DefaultsToDark: Story = {
  args: { defaultColorScheme: "dark" },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("script")?.textContent).toContain('var c="dark"');
  },
};

export const DefaultsToLight: Story = {
  args: { defaultColorScheme: "light" },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("script")?.textContent).toContain('var c="light"');
  },
};

export const DefaultsToTheSystemScheme: Story = {
  args: { defaultColorScheme: "auto" },
  play: async ({ canvasElement }) => {
    const script = canvasElement.querySelector("script")?.textContent;
    await expect(script).toContain('var c="auto"');
    await expect(script).toContain("prefers-color-scheme: dark");
  },
};

export const ForcedLight: Story = {
  args: { forceColorScheme: "light" },
  play: async ({ canvasElement }) => {
    const script = canvasElement.querySelector("script");
    await expect(script?.textContent).not.toContain("localStorage");
    await expect(script?.textContent).toContain('"light"');
  },
};

export const EveryDefaultColorScheme: Story = everyValueOf(meta, "defaultColorScheme");

export const EveryForcedColorScheme: Story = everyValueOf(meta, "forceColorScheme");
