import { TextInput } from "@solix/core";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent } from "storybook/test";

const meta = {
  component: TextInput,
  args: { "aria-label": "Email", type: "email", placeholder: "you@example.com" },
} satisfies Meta<typeof TextInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Typed: Story = {
  play: async ({ canvas }) => {
    const input = canvas.getByRole("textbox", { name: "Email" });
    await userEvent.type(input, "someone@example.com");
    await expect(input).toHaveValue("someone@example.com");
  },
};

export const Disabled: Story = {
  args: { disabled: true },
};
