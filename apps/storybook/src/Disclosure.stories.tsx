import { Disclosure } from "@solix/core";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent } from "storybook/test";

const meta = {
  component: Disclosure,
  args: { label: "Details", children: "Content shown when open" },
} satisfies Meta<typeof Disclosure>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Closed: Story = {};

export const OpenedByItsSummary: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByText("Details"));
    await expect(canvas.getByText("Content shown when open")).toBeVisible();
  },
};
