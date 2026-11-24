import { ColorSchemeScript, colorSchemeAttribute } from "@solix/core";
import { argTypesOf } from "virtual:story-controls";
import { expect } from "storybook/test";
import { everyValueOf, type Observation } from "#/every-value.tsx";
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
    await expect(script).toHaveTextContent(JSON.stringify(storageKey));
    await expect(script).toHaveProperty("nonce", "story-nonce");
  },
};

export const Forced: Story = {
  args: { forceColorScheme: "dark" },
  play: async ({ canvasElement }) => {
    const script = canvasElement.querySelector("script");
    await expect(script).not.toHaveTextContent("localStorage");
    await expect(script).toHaveTextContent('"dark"');
  },
};

export const DefaultsToDark: Story = {
  args: { defaultColorScheme: "dark" },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("script")).toHaveTextContent('var c="dark"');
  },
};

export const DefaultsToLight: Story = {
  args: { defaultColorScheme: "light" },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("script")).toHaveTextContent('var c="light"');
  },
};

export const DefaultsToTheSystemScheme: Story = {
  args: { defaultColorScheme: "auto" },
  play: async ({ canvasElement }) => {
    const script = canvasElement.querySelector("script");
    await expect(script).toHaveTextContent('var c="auto"');
    await expect(script).toHaveTextContent("prefers-color-scheme: dark");
  },
};

export const ForcedLight: Story = {
  args: { forceColorScheme: "light" },
  play: async ({ canvasElement }) => {
    const script = canvasElement.querySelector("script");
    await expect(script).not.toHaveTextContent("localStorage");
    await expect(script).toHaveTextContent('"light"');
  },
};

const systemSchemes = ["light", "dark"] as const;

function schemeSetIn(system: (typeof systemSchemes)[number], text: string): string {
  const frame = document.createElement("iframe");
  document.body.append(frame);
  try {
    const page = frame.contentWindow;
    const scripted = frame.contentDocument;
    if (page === null || scripted === null) {
      throw new Error("The frame that runs the colour-scheme script has no page.");
    }
    Reflect.set(page, "matchMedia", (query: string) => ({
      matches: query === `(prefers-color-scheme: ${system})`,
    }));
    Object.defineProperty(page, "localStorage", { value: { getItem: () => null } });
    const script = scripted.createElement("script");
    script.text = text;
    scripted.head.append(script);
    return scripted.documentElement.getAttribute(colorSchemeAttribute) ?? "nothing";
  } finally {
    frame.remove();
  }
}

const schemeTheScriptSets: Observation = {
  name: "the scheme its script sets under a light and a dark system",
  of: (container) => [
    systemSchemes.map(
      (system) =>
        `${system}: ${schemeSetIn(system, container.querySelector("script")?.text ?? "")}`,
    ),
  ],
};

export const EveryDefaultColorScheme: Story = everyValueOf(meta, "defaultColorScheme", {
  observe: schemeTheScriptSets,
});

export const EveryForcedColorScheme: Story = everyValueOf(meta, "forceColorScheme", {
  observe: schemeTheScriptSets,
});
