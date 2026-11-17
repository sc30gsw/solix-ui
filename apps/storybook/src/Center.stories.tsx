import { Center } from "@solix/core";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

const meta = {
  component: Center,
  args: { children: "Centred content", h: 120 },
} satisfies Meta<typeof Center>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Inline: Story = {
  args: { inline: true },
};
